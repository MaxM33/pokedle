const initializeApp = require("firebase/app").initializeApp;
const Firestore = require("firebase/firestore");
var createError = require("http-errors");
var logger = require("morgan");
var path = require("path");
var express = require("express");

const { v4: uuidv4 } = require("uuid");

const firebaseConfig = {
  apiKey: "AIzaSyBkHJGjV3MdHdqX54BwTrCkKuQt3tmzEhQ",
  authDomain: "pokedle-14739.firebaseapp.com",
  projectId: "pokedle-14739",
  storageBucket: "pokedle-14739.appspot.com",
  messagingSenderId: "576792023907",
  appId: "1:576792023907:web:87bfee996f8bb14b2c3956",
  measurementId: "G-TBRPL5L80L",
};

// initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = Firestore.getFirestore(firebaseApp);

// function to generate a pokemonID
function generateNewPokemon() {
  return Math.floor(Math.random() * 151 + 1);
}

// function to verify the client's guess
function verifyGuess(guess, answer) {
  var response = {
    hasWon: true,
    habitat: "correct",
    color: "correct",
    type: "correct",
    fullyEvolved: "correct",
    evolutionLevel: "correct",
  };
  var count = 0;
  if (guess.name != answer.name) {
    response.hasWon = false;
    if (guess.fullyEvolved != answer.fullyEvolved)
      response.fullyEvolved = "wrong";
    if (guess.evolutionLevel != answer.evolutionLevel)
      response.evolutionLevel = "wrong";
    if (guess.habitat != answer.habitat) response.habitat = "wrong";

    var guessColors = guess.color.split(", ");
    for (var i = 0; i < guessColors.length; i++) {
      if (answer.color.includes(guessColors[i])) {
        count++;
      }
    }
    var colors = answer.color.split(", ");
    if (count == 0) response.color = "wrong";
    else if (colors.length != count || guessColors.length != count)
      response.color = "partial";
    count = 0;

    var guessTypes = guess.type.split(", ");
    for (var i = 0; i < guessTypes.length; i++) {
      if (answer.type.includes(guessTypes[i])) {
        count++;
      }
    }
    var types = answer.type.split(", ");
    if (count == 0) response.type = "wrong";
    else if (types.length != count || guessTypes.length != count)
      response.type = "partial";
  }
  return response;
}

// function to get a user from db given its id
async function getUserById(id) {
  var userRef = Firestore.doc(db, "users", id);
  var userDoc = await Firestore.getDoc(userRef);
  return userDoc.data();
}

// keeps stored objects of the form <key,value>, in which key is user's UUID and value is the current pokemonID he has to guess
var dataStore = [];

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.static(path.join(__dirname, "")));

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/rankings", (req, res) => {
  res.render("rankings");
});

// getting from db the top 10 users ordered descendingly by wins
app.get("/rankings/view", async (req, res) => {
  var userRef = Firestore.collection(db, "users");
  const q = Firestore.query(
    userRef,
    Firestore.orderBy("wins", "desc"),
    Firestore.limit(10)
  );
  var userDocs = await Firestore.getDocs(q);
  var i = 1;
  var array = [];
  userDocs.forEach((doc) => {
    array[i] = doc.data();
    array[i].id = doc.id;
    i++;
  });
  res.send(array);
});

// render user's pokedex page
app.get("/profile/:id/pokedex", async (req, res, next) => {
  // user.uid is always a 28 characters string
  if (req.params.id.length == 28) {
    // check if user actually exists
    var answer = await getUserById(req.params.id);
    if (answer == null) {
      next();
    } else {
      res.locals.name = answer.name;
      res.locals.id = req.params.id;
      res.render("pokedex");
    }
  } else next();
});

// get pokedex of requested user
app.get("/profile/:id/pokedex/view", async (req, res, next) => {
  // user.uid is always a 28 characters string
  if (req.params.id.length == 28) {
    // check if user actually exists
    var answer = await getUserById(req.params.id);
    if (answer == null) {
      next();
    } else {
      res.send(answer.history);
    }
  } else next();
});

// gets data about requested user
app.get("/profile/:id", async (req, res, next) => {
  // user.uid is always a 28 characters string
  if (req.params.id.length == 28) {
    // check if user actually exists
    var answer = await getUserById(req.params.id);
    if (answer == null) {
      next();
    } else {
      res.locals.name = answer.name;
      res.locals.wins = answer.wins;
      res.locals.avgTries = Math.round(answer.avgTries * 100) / 100;
      res.render("profile");
    }
  } else next();
});

// Invoked on login, creates a document if user is not existent
app.post("/id/:id", async (req, res) => {
  if (req.params.id.length == 28 && req.body.name != null) {
    var answer = await getUserById(req.params.id);
    if (answer == null) {
      answer = {
        name: req.body.name,
        wins: 0,
        avgTries: 0,
        history: [],
      };
      var userRef = Firestore.doc(db, "users", req.params.id);
      Firestore.setDoc(userRef, answer);
      // end request-response cycle
      res.status(201).end();
    } else res.status(304).end();
  } else {
    res.status(404).end();
  }
});

// Invoked when a logged user wins a game, to update his statistics
// Number of tries made for this game is passed in request's body
app.put("/id/:id", async (req, res) => {
  if (req.params.id.length == 28 && req.body.try != null) {
    var found = false;
    // get user statistics
    var answer = await getUserById(req.params.id);
    // update with new statistics
    answer.avgTries =
      (answer.wins * answer.avgTries + req.body.try) / (answer.wins + 1);
    answer.wins++;
    // updating the pokedex
    for (var i = 0; i < answer.history.length; i++) {
      if (answer.history[i].pokemon == req.body.pokemon) {
        answer.history[i].timesGuessed++;
        found = true;
        break;
      }
    }
    if (!found) {
      answer.history.push({ pokemon: req.body.pokemon, timesGuessed: 1 });
    }
    // update the document
    var userRef = Firestore.doc(db, "users", req.params.id);
    Firestore.setDoc(userRef, answer);
    // end request-response cycle
    res.status(200).end();
  } else {
    res.status(404).end();
  }
});

app.get("/userID", (req, res) => {
  // user has no ID, so generate userID and pokemonID
  var id = uuidv4();
  dataStore[id] = generateNewPokemon();
  res.send(id);
});

app.post("/", async (req, res) => {
  // if user has an ID but is not bound to a pokemonID (e.g. when server restarts), another pokemonID is generated
  if (dataStore[req.body.clientID] == undefined)
    dataStore[req.body.clientID] = generateNewPokemon();
  // get the document to extract data about generated pokémonID
  var pokemonRef = Firestore.doc(
    db,
    "pokemons",
    dataStore[req.body.clientID].toString()
  );
  var pokemonDoc = await Firestore.getDoc(pokemonRef);
  var answer = pokemonDoc.data();
  //////////////////////////////////////////////////////////////////////////////// for testing
  console.log("Solution is: " + answer.name);
  // make a query to get data about guessed pokémon
  var q = Firestore.query(
    Firestore.collection(db, "pokemons"),
    Firestore.where("name", "==", req.body.string)
  );
  pokemonDoc = await Firestore.getDocs(q);
  pokemonDoc.forEach((doc) => {
    var guess = doc.data();
    // confronting guess with answer, this function returns the hints to help user's guesses
    var response = verifyGuess(guess, answer);
    if (response.hasWon) {
      // user has won the game here, so re-generate pokémonID
      dataStore[req.body.clientID] = generateNewPokemon();
    }
    res.send([guess, response]);
  });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
