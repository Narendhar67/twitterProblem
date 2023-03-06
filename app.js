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
  const Query = `SELECT tweet , date_time as dateTime 
  FROM 
  follower INNER JOIN tweet ON following_user_id = user_id
  WHERE user_id = ${user_id}
  ORDER BY dateTime
  LIMIT 4;`;
  const dbRes = await db.all(Query);
  function getTweet(obj) {
    return {
      username: username,
      tweet: obj.tweet,
      dateTime: obj.dateTime,
    };
  }
  const result = dbRes.map(getTweet);
  response.send(result);
});

// API-4 user following userNames

app.get("/user/following/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const Query = `SELECT username AS name FROM follower INNER JOIN user 
    ON following_user_id = user_id WHERE follower_user_id = ${user_id};`;
  const dbRes = await db.all(Query);
  response.send(dbRes);
});

// API-5 user followers userNames

app.get("/user/followers/", authenticate, async (request, response) => {
  const { username, user_id } = request.user;
  const Query = `SELECT username AS name FROM follower INNER JOIN user 
    ON following_user_id = user_id WHERE follower_user_id = ${user_id};`;
  const dbRes = await db.all(Query);
  response.send(dbRes);
});
