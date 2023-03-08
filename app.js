const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const InitializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Started at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB Error : ${error.message}`);
    process.exit(1);
  }
};

InitializeDBAndServer();

// Authentication => verifying jwtToken
// middleWare function

const authenticate = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];

    jwt.verify(jwtToken, "97000", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.user = payload;
        next();
      }
    });
  }
};

// User following check
// followingCheck middleware function

const followingCheck = async (request, response, next) => {
  const { username, user_id } = request.user;
  const { tweetId } = request.params;
  const tweetOwner = `SELECT user_id AS tweetUserId FROM tweet WHERE tweet_id = ${tweetId};`;
  const { tweetUserId } = await db.get(tweetOwner);

  const followingCheckQuery = `SELECT * FROM follower 
  WHERE follower_user_id = ${user_id} AND following_user_id = ${tweetUserId};`;
  const isFollower = await db.get(followingCheckQuery);

  if (isFollower !== undefined) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

// API-1 Register User

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const UsernameCheckQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbResponse = await db.get(UsernameCheckQuery);
  if (dbResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const CreateUserUserQuery = `INSERT INTO user(username , password , name , gender) 
            VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(CreateUserUserQuery);
      response.send("User created successfully");
    }
  }
});

// API-2 login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const UsernameCheckQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const UserDetails = await db.get(UsernameCheckQuery);

  let jwtToken;

  if (UserDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      UserDetails.password
    );
    const user_id = UserDetails.user_id;
    const payload = { username, user_id };
    if (isPasswordMatched) {
      jwtToken = await jwt.sign(payload, "97000");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API-3 Return the Latest 4 tweets

app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const Query = `SELECT username, tweet , date_time as dateTime 
  FROM 
  (follower INNER JOIN tweet ON following_user_id = user_id) AS T
  INNER JOIN user ON T.following_user_id = user.user_id
  WHERE follower_user_id = ${user_id}
  ORDER BY dateTime DESC
  LIMIT 4;`;
  const dbRes = await db.all(Query);
  response.send(dbRes);
});

// API-4 user following userNames

app.get("/user/following/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const Query = `SELECT name FROM follower INNER JOIN user 
    ON following_user_id = user_id WHERE follower_user_id = ${user_id};`;
  const dbRes = await db.all(Query);
  response.send(dbRes);
});

// API-5 user followers userNames

app.get("/user/followers/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const Query = `SELECT name FROM follower INNER JOIN user 
    ON follower_user_id = user_id WHERE following_user_id = ${user_id};`;
  const dbRes = await db.all(Query);
  response.send(dbRes);
});

// API-6  request a specific tweet

app.get(
  "/tweets/:tweetId/",
  authenticate,
  followingCheck,
  async (request, response) => {
    const { username, user_id } = request.user;
    const { tweetId } = request.params;

    const tweetQuery = `SELECT 
  tweet,
  count(DISTINCT like_id) AS likes,
  count(DISTINCT reply_id) AS replies,
  date_time AS dateTime
  FROM 
  (tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
  LEFT JOIN like ON T.tweet_id = like.tweet_id
  WHERE 
  T.tweet_id = ${tweetId}
  GROUP BY T.tweet_id;`;
    const Tweet = await db.get(tweetQuery);
    response.send(Tweet);
  }
);

// API -7 => gets liked people names of a tweet

app.get(
  "/tweets/:tweetId/likes/",
  authenticate,
  followingCheck,
  async (request, response) => {
    const { tweetId } = request.params;
    const getUsernamesQuery = `SELECT username FROM
    like INNER JOIN user 
    ON 
    like.user_id = user.user_id 
    WHERE
    tweet_id = ${tweetId};`;
    const result = await db.all(getUsernamesQuery);

    const likesList = [];
    for (let OBJ of result) {
      likesList.push(OBJ.username);
    }

    response.send({ likes: likesList });
  }
);

// API-8 => get replies of a tweet

app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  followingCheck,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplies = `SELECT name, reply FROM
    reply INNER JOIN user 
    ON 
    reply.user_id = user.user_id 
    WHERE
    tweet_id = ${tweetId};`;
    const result = await db.all(getReplies);
    response.send({ replies: result });
  }
);

// API-9 list of tweets of the user

app.get("/user/tweets/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const getAllTweets = `SELECT 
    tweet,
    count(DISTINCT like_id) AS likes,
    count(DISTINCT reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM
    (tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${user_id}
    GROUP BY tweet.tweet_id;`;
  const result = await db.all(getAllTweets);
  response.send(result);
});

// API -10 => Create a tweet

app.post("/user/tweets/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const date_time = new Date();
  const { tweet } = request.body;

  const createTweet = `INSERT INTO tweet (tweet,user_id,date_time) 
    VALUES('${tweet}', ${user_id},'${date_time}');`;
  await db.run(createTweet);
  response.send("Created a Tweet");
});

// API-11 Delete tweet

app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const { tweetId } = request.params;
  const getTweet = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;

  const Tweet = await db.get(getTweet);

  const deleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
  if (user_id === Tweet.user_id) {
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
