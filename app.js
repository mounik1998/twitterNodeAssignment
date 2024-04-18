const express = require("express");
const app = express();

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const connectServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("server connected");
    });
  } catch (e) {
    console.log(`error : ${e.message}`);
    process.exit(1);
  }
};

module.exports = app;

connectServer();

getFollowingPeopleIdsList = async (username) => {
  const dbFollowingUserIdsQuery = `
  SELECT 
  following_user_id 
  FROM 
  follower INNER JOIN user 
  ON 
  follower.follower_user_id = user.user_id 
  WHERE 
  user.username = "${username}";`;

  const followerUserIds = await db.all(dbFollowingUserIdsQuery);

  const arrayOfIds = followerUserIds.map((item) => item.following_user_id);
  return arrayOfIds;
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;

  const dbTweetAccessQuery = `
  SELECT 
    * 
  FROM
    tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
  WHERE
    tweet.tweet_id = ${tweetId} AND follower_user_id = ${userId}
  ;`;

  const tweet = await db.get(dbTweetAccessQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//authentication

const authentication = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//api 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const dbQuery = `SELECT * FROM user WHERE username = "${username}";`;
  const userDetails = await db.get(dbQuery);

  if (userDetails !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const dbAddUserQuery = `
      INSERT INTO 
      user(username,password,name,gender) 
      VALUES 
      ("${username}","${hashedPassword}","${name}","${gender}");`;
      await db.run(dbAddUserQuery);

      response.status(200);
      response.send("User created successfully");
    }
  }
});

//api 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const dbCheckUserQuery = `SELECT * FROM user WHERE username = "${username}";`;
  const dbUserDetails = await db.get(dbCheckUserQuery);

  if (dbUserDetails !== undefined) {
    const passwordChecking = await bcrypt.compare(
      password,
      dbUserDetails.password
    );

    if (passwordChecking) {
      const payload = { username, userId: dbUserDetails.user_id };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");

      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;

  const userFollowingPeopleIdsList = await getFollowingPeopleIdsList(username);

  const dbGetTweetsQuery = `
  SELECT 
    username,tweet,date_time as dateTime 
FROM 
    tweet INNER JOIN user ON user.user_id = tweet.user_id
WHERE
    user.user_id IN (${userFollowingPeopleIdsList})
ORDER BY 
    date_time DESC
LIMIT 
    4
;`;

  const latestFourTweets = await db.all(dbGetTweetsQuery);
  response.send(latestFourTweets);
});

//ap1 4

app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;

  const dbFollowingNamesQuery = `
  SELECT 
    name 
  FROM
    user INNER JOIN follower ON  user.user_id = follower.following_user_id
  WHERE 
    follower_user_id = ${userId}
  ;`;

  const userFollowingNames = await db.all(dbFollowingNamesQuery);

  response.send(userFollowingNames);
});

//api 5

app.get("/user/followers/", authentication, async (request, response) => {
  const { username, userId } = request;

  const dbFollowingNamesQuery = `
  SELECT 
    DISTINCT name 
  FROM
    user INNER JOIN follower ON  user.user_id = follower.follower_user_id
  WHERE 
    following_user_id = ${userId}
  ;`;

  const userFollowersNames = await db.all(dbFollowingNamesQuery);

  response.send(userFollowersNames);
});

//api 6

app.get(
  "/tweets/:tweetId/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;

    const dbTweetDetailsQuery = `
    SELECT
        tweet,
        (SELECT count() FROM like WHERE tweet_id=${tweetId}) as likes,
        (SELECT count() FROM reply WHERE tweet_id=${tweetId}) as replies,
        date_time as dateTime 
    FROM 
        tweet
    WHERE
        tweet_id=${tweetId};`;

    const tweetDetails = await db.get(dbTweetDetailsQuery);

    response.send(tweetDetails);
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { userId, username } = request;
    const { tweetId } = request.params;

    const dbGetUserWhoLiked = `
    SELECT username FROM 
        like INNER JOIN user 
    ON 
        like.user_id = user.user_id
    WHERE 
        like.tweet_id = ${tweetId}
    ;`;

    const usersWhoLiked = await db.all(dbGetUserWhoLiked);
    const usersArray = usersWhoLiked.map((item) => item.username);
    response.send({ likes: usersArray });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;

    const dbGetRepliesQuery = `
    SELECT 
        name,reply 
    FROM 
        reply INNER JOIN user
    ON 
        reply.user_id = user.user_id
    WHERE
        reply.tweet_id = ${tweetId}
    ;`;

    const replies = await db.all(dbGetRepliesQuery);

    const repliesArray = replies.map((item) => ({
      name: item.name,
      reply: item.reply,
    }));

    response.send({ replies: repliesArray });
  }
);

//api 9

app.get("/user/tweets/", authentication, async (request, response) => {
  const { username, userId } = request;

  const dbQuery = `
  SELECT 
    tweet,
    count(DISTINCT like_id) as likes,
    count(DISTINCT reply_id) as replies,
    date_time as dateTime 
  FROM 
    tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id  INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
  WHERE 
    tweet.user_id = ${userId}
  GROUP BY
    tweet.tweet_id
  ;`;

  const output = await db.all(dbQuery);

  response.send(output);
});

//api 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");

  const dbAddTweetQuery = `
  INSERT INTO 
    tweet(tweet,user_id,date_time)
  Values ("${tweet}",${userId},"${dateTime}")
  ;`;

  await db.run(dbAddTweetQuery);

  response.send("Created a Tweet");
});

//api 11

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;

  const dbQuery = `SELECT * FROM tweet WHERE user_id = ${userId} AND tweet_id =${tweetId};`;

  const result = await db.get(dbQuery);

  if (result !== undefined) {
    const dbDelQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
    await db.run(dbDelQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
