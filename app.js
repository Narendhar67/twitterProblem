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
  const payload = { username };
  if (UserDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      UserDetails.password
    );
    if (isPasswordMatched) {
      jwtToken = await jwt.sign(payload, "97000");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
