/* vim:set ts=2 sw=2 expandtab: */

//
// server
//
var express = require('express');
var app = express();
var http = require('http').Server(app);
var url = require('url');
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var name2socket = {};

app.use(express.static('public'));

http.listen(port, function() {
  console.log('listening on *:' + port);
});

//
// chat
//

// server selects color.
var cindex = 0;
var colors = [ 'red', 'blue', 'green', 'orange', 'cyan', 'pink', 'purple' ];

function isNameUnique(name)
{
  var unique = true;
  for (var i = 0; i < game.players.length; ++i)
  {
    if (game.players[i].name == name)
    {
      return false;
    }
  }
  return true;
}

function findPlayer(name)
{
  for (var i = 0; i < game.players.length; ++i)
  {
    if (game.players[i].name == name)
    {
      return game.players[i];
    }
  }
  return undefined;
}

// http://stackoverflow.com/questions/22607150/getting-the-url-parameters-inside-the-html-page
function GetURLParameter(sSearch, sParam, default_value)
{
    var sURLVariables = sSearch.substring(1).split('&');
    for (var i = 0; i < sURLVariables.length; i++)
    {
        var sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] == sParam)
        {
            return sParameterName[1];
        }
    }
    return default_value;
}

io.on('connection', function(socket) {
  socket.on('chat message', function(name, msg) {
    if (name.length)
    {
      // Only do something if a name was specified.

      let now = new Date().getTime();

      if (socket.name == name)
      {
        // This is an existing user so emit their message if there is one.
        if (msg.length) {
          io.emit('chat message', now, socket.color, socket.name, msg);
        }
      }
      else if (!isNameUnique(name))
      {
        // The specified name was not unique.

        if (socket.name == undefined)
        {
          // A new player tried to use a name that was already in use.
          io.emit('chat message', now, 'black', 'system', `failed to add player with name ${name}`);
          socket.emit('name failed'); // This will 'clear' the name from the name field at the client.
          if (msg.length) {
            io.emit('chat message', now, 'black', 'system', msg);
          }
        }
        else
        {
          // An existing player tried to rename to a name that was already in use.
          io.emit('chat message', now, socket.color, socket.name, `failed to change name to ${name}`);
        }
      }
      else
      {
        // The specified name was unique.

        if (socket.name == undefined)
        {
          // This is a new player.

          // This is a new player so create them in the game context.  socket.name = name;
          socket.name = name;
          socket.color = colors[cindex];
          cindex = (cindex + 1) % colors.length;
          io.emit('chat message', now, socket.color, socket.name, 'joined the game');

          // Add the player in the context of the game.
          name2socket[name] = socket;
          game.players.push(new Player(socket.name, socket.color));
          // Force a refresh of the client's board.
          io.emit('refresh');
        }
        else
        if (socket.name != name)
        {
          // This is an existing player changing their name.

          // Change the players name in the context of the game.
          for (var i = 0; i < game.players.length; ++i)
          {
            if (game.players[i].name == socket.name)
            {
              // Remove old map entry and insert new.
              delete name2socket[socket.name];
              name2socket[name] = socket;
              game.players[i].name = name;
              // Force a refresh of the all of the client boards.
              io.emit('refresh');
              break;
            }
          }

          // Announce in chat the name change.
          io.emit('chat message', now, 'black', socket.name, `changed name to ${name}`)
          socket.name = name;
        }

        // Handle any msg, whether its a new player or an existing player.
        if (msg.length) {
          io.emit('chat message', now, socket.color, socket.name, msg);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    let now = new Date().getTime();

    // Remove old map entry and insert new.
    delete name2socket[socket.name];

    // Remove the player.
    for (let i = 0; i < game.players.length; ++i) {
      if (game.players[i].name == socket.name) {
        game.players.splice(i,1);
        break;
      }
    }

    // Announce in chat that this player has left.
    // TODO Figure out how the 'null: left the game' messages were coming through and this if had to be inserted.
    if (socket != undefined && socket.name != undefined) {
      io.emit('chat message', now, 'black', socket.name, 'left the game');

      // Force a refresh of the all of the client boards.
      io.emit('refresh');
    }
  });
});

//
// game
//

////
////    require('./category.js');
////
var catNames = [
    "Ones",
    "Twos",
    "Threes",
    "Fours",
    "Fives",
    "Sixes",
    "Top Bonus",
    "Top Total",
    "3 of a Kind",
    "4 of a Kind",
    "Full House",
    "Small Straight",
    "Large Straight",
    "Yahtzee",
    "Chance",
    "Yahtzee Bonus",
    "Bottom Total",
    "Total",
];

var catClasses = [
    "category",
    "category",
    "category",
    "category",
    "category",
    "category",
    "bonus",
    "total",
    "category",
    "category",
    "category",
    "category",
    "category",
    "category",
    "category",
    "bonus",
    "total",
    "total",
];

function CountOccurrencesOfEachValue(player) {
    var counts = [ 0, 0, 0, 0, 0, 0 ]; // Occurrences of 1s..6s in index 0..5, respectively.
    for (var i = 0; i < 5; ++i) {
        var value = player.state.die[i].value;
        counts[value-1]++;
    }
    return counts;
}

function CountOccurrencesOfValue(player, value) {
    var score = 0;
    for (var i = 0; i < 5; ++i) {
        if (player.state.die[i].value == value) {
            score += value;
        }
    }
    return score;
}

function Count(player, required) {
    // Count how many of each die there is.
    var sum = 0; // just in case we end up scoring this we might as well sum up the dice along the way.
    var scoreit = false;
    var counts = [ 0, 0, 0, 0, 0, 0, 0 ]; // We only use [1] through [6]
    for (var i = 0; i < 5; ++i) {
        var value = player.state.die[i].value;
        counts[value]++;
        if (counts[value] >= required) {
            scoreit = true;
        }
        sum += value;
    }
    // If there are 'required' number of any of the die then return the sume of the die!
    var score = 0;
    if (scoreit) {
        if (required == 5) {
            score = 50;
        } else {
            score = sum;
        }
    }
    return score;
}

function FullHouse(player) {
  var score = 0;
  var have2 = false;
  var have3 = false;
  var counts = CountOccurrencesOfEachValue(player);
  if (counts[0] == 5 || counts[1] == 5 || counts[2] == 5 || counts[3] == 5 || counts[4] == 5 || counts[5] == 5) {
    have2 = true;
    have3 = true;
  } else {
    for (var i = 0; i < counts.length; ++i) {
        if (counts[i] >= 3) {
            have3 = true;
        } else if (counts[i] >= 2) {
            have2 = true;
        }
    }
  }
  if (have2 && have3) {
      score = 25;
  }
  return score;
}

function AllSameValue(counts) {
  if (counts[0] == 5 || counts[1] == 5 || counts[2] == 5 || counts[3] == 5 || counts[4] == 5 || counts[5] == 5) {
    return true;
  } else {
    return false;
  }
}

function Straight(player, required_in_a_row) {
    var score = 0;
    var counts = CountOccurrencesOfEachValue(player);
    if (required_in_a_row == 4) {
        if (counts[0] == 5 || counts[1] == 5 || counts[2] == 5 || counts[3] == 5 || counts[4] == 5 || counts[5] == 5) {
            score = 30; // handle yatc bonus later.
        } else if (counts[0] && counts[1] && counts[2] && counts[3]) {
            score = 30;
        } else if (counts[1] && counts[2] && counts[3] && counts[4]) {
            score = 30;
        } else if (counts[2] && counts[3] && counts[4] && counts[5]) {
            score = 30;
        }
    } else if (required_in_a_row == 5) {
        if (counts[0] == 5 || counts[1] == 5 || counts[2] == 5 || counts[3] == 5 || counts[4] == 5 || counts[5] == 5) {
            score = 40; // handle yatc bonus later.
        } else if (counts[0] && counts[1] && counts[2] && counts[3] && counts[4]) {
            score = 40;
        } else if (counts[1] && counts[2] && counts[3] && counts[4] && counts[5]) {
            score = 40;
        }
    }
    return score;
}

function Score(player, id)
{
  if (player.state.rounds > 13) {
    console.error('Score('+id+') trying to score past round 13.');
    return false;
  }

  if (id == -1) {
    // The category of -1 means score this in the next category that hasn't already been taken.
    for (var i = 0; i < player.categories.length; ++i) {
      if (player.categories[i].taken == false) {
        id = i;
        break;
      }
    }
  }
  if (id == -1) {
    console.error('Score('+id+') trying to score after all the categories have been scored.');
    return false; // There's nothing left to score.. client should be prevented from hitting score any more.
  }

  if (player.categories[id].taken) {
    console.error('Score('+id+') trying to score in a category that has already been scored in.');
    return false;
  }

  // console.log('Scoring in category ' + id);
  switch(id) {
      case 0: // 1's
      case 1: // 2's
      case 2: // 3's
      case 3: // 4's
      case 4: // 5's
      case 5: // 6's
          player.categories[id].score = CountOccurrencesOfValue(player, id+1);
          break;
      case 8: // 3 of kind
          player.categories[id].score = Count(player, 3);
          break;
      case 9: // 4 of kind
          player.categories[id].score = Count(player, 4);
          break;
      case 10: // full house
          player.categories[id].score = FullHouse(player);
          break;
      case 11: // sm straight
          player.categories[id].score = Straight(player, 4);
          break;
      case 12: // lg straight
          player.categories[id].score = Straight(player, 5);
          break;
      case 13: // yatc
          player.categories[id].score = Count(player, 5);
          break;
      case 14: // chance
          player.categories[id].score = Count(player, 0);
          break;
      default:
          break;
  }
  // If we're not scoring a yahtzee *and* a yahtzee has already been scored then add a yahtzee bonus.
  // To get a yahtzee bonus you must meet:
  //  1. You're not getting a yahtzee in this roll.
  //  2. You already have one yahtzee.
  //  3. You must have scored non-0 in the category you just took.
  //  4. You must have another yahtzee.
  let counts = CountOccurrencesOfEachValue(player);
  if (id != 13 && player.categories[13].score == 50 && player.categories[id].score != 0 && AllSameValue(counts)) {
    player.categories[15].score += 100;
  }
  player.categories[id].taken = true;
  player.score(); // Update totals.
  return true;
}

function Category(id) {
    this.id = id; // id is index in catNames array.
    this.taken = false;
    if (id == 6 || id == 7 || id >= 15) {
        this.taken = true;
    }
    // console.log('Category('+id+') taken='+this.taken);
    this.score = 0;
    this.calculate = function(dice) {
        return 0;
    }

    // TODO call rest in constructor.
    this.reset = function() {
      this.score = 0;
      if (this.id == 6 || this.id == 7 || this.id >= 15) {
        this.taken = true;
      } else {
        this.taken = false;
      }
    }
}

////
////    require('./player.js');
////
function Player(name, color) {
    this.name = name;
    this.color = color;
    this.categories = [
        new Category(0),
        new Category(1),
        new Category(2),
        new Category(3),
        new Category(4),
        new Category(5),
        new Category(6),
        new Category(7),
        new Category(8),
        new Category(9),
        new Category(10),
        new Category(11),
        new Category(12),
        new Category(13),
        new Category(14),
        new Category(15),
        new Category(16),
        new Category(17),
    ];
    this.state = new State();
    this.total = 0;

    this.score = function() {
        var toptotal = 0;
        for (var i = 0; i < 6; ++i) {
            toptotal += this.categories[i].score;
        }
        if (toptotal >= 63) {
            this.categories[6].score = 35;
        } else {
            this.categories[6].score = 0;
        }
        this.categories[7].score = this.categories[6].score + toptotal;

        var bottotal = 0;
        for (var i = 8; i < 15; ++i) {
            bottotal += this.categories[i].score;
        }
        //this.categories[15].score
        this.categories[16].score = this.categories[15].score + bottotal;
        this.categories[17].score = this.categories[7].score + this.categories[16].score;
    }

    this.reset = function() {
      this.state = new State();
      for (var i = 0; i < 18; ++i) {
        this.categories[i].reset();
      }
    }
}

function Roll() {
    return 1 + Math.floor(Math.random() * 6);
}

function Dice() {
    this.value = 0;   // The value of this die.
    this.roll = true; // The server tells the client to roll everything!
}

function State() {
    this.rounds = 0; // How many rounds have been played?
    this.player = 0; // What player index is currently rolling?
    this.rolls = 0;  // How many rolls has the current player done?
    this.die = [
        new Dice(),
        new Dice(),
        new Dice(),
        new Dice(),
        new Dice()
    ];
}

////
////    require('./game.js');
////
function Game() {
    this.players = [];
}

//// ////
var game = new Game();

app.get('/catnames', function (req,res) {
  res.send(JSON.stringify(catNames, null, 3));
});

app.get('/catclasses', function (req,res) {
  res.send(JSON.stringify(catClasses, null, 3));
});

app.get('/state', function (req,res) {
  var q = url.parse(req.url, true);
  var name = GetURLParameter(q.search, 'name', '');
  var player = findPlayer(name);
  if (player == undefined) {
    res.send(JSON.stringify(new State(), null, 3));
  } else {
    res.send(JSON.stringify(player.state, null, 3));
  }
});

app.get('/players', function (req,res) {
  res.send(JSON.stringify(game.players, null, 3));
});

app.get('/roll', function (req,res) {
  // Protect against the client cheating and trying to roll more than 3 times.
  var q = url.parse(req.url, true);
  var name = GetURLParameter(q.search, 'name', '');
  var player = findPlayer(name);
  var dieString = GetURLParameter(q.search, 'die', '');
  var die = JSON.parse(dieString.replace(/%22/g, '"'));
  // console.log(`name=${name} die=${dieString}`);
  if (player.state.rolls < 3) {
    player.state.rolls++;
    for (var i = 0; i < 5; ++i) {
        if (die[i].roll) {
            player.state.die[i].value = Roll();
        }
    }
    res.send(JSON.stringify(player.state, null, 3));
  }
});

app.get('/score', function (req,res) {
  let now = new Date().getTime();
  var q = url.parse(req.url, true);
  var name = GetURLParameter(q.search, 'name', '');
  var player = findPlayer(name);
  var scoreString = GetURLParameter(q.search, 'id', '');
  var category = JSON.parse(scoreString.replace(/%22/g, '"'));
  // console.log(`name=${name} score=${category}`);
  var ok = Score(player, category);
  if (ok) {
    // Now, do game maintenance.
    player.state.die = [
        new Dice(),
        new Dice(),
        new Dice(),
        new Dice(),
        new Dice()
    ];
    player.state.rolls = 0;
    player.state.rounds++;
    if (player.state.rounds >= 13) {
        // Game is over.
        let socket = name2socket[name];
        io.emit('chat message', now, socket.color, socket.name, player.categories[17].score);
    }
    res.send(JSON.stringify(game, null, 3));
    io.emit('refresh');
  }
});

app.get('/refresh', function (req,res) {
  res.send(JSON.stringify(game, null, 3));
});

app.get('/restart', function (req,res) {
  var q = url.parse(req.url, true);
  var name = GetURLParameter(q.search, 'name', '');
  var player = findPlayer(name);
  player.reset();
  res.send(JSON.stringify(game, null, 3));
});
