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

io.on('connection', function(socket) {
  socket.on('chat message', function(name, msg) {
    // Unless there is a name, do nothing!
    if (name.length) {
      // If there's no name associated with this socket yet, then associate this name.
      if (socket.name == undefined) {
        socket.name = name;
        socket.color = colors[cindex];
        cindex = (cindex + 1) % colors.length;
        // Add a player with this name.
        game.players.push(new Player(name));
        // TODO Force a refresh of the client's board.
        io.emit('refresh');
      }
      // If this name is different than the name that associated with this socket then announce that fact.
      if (socket.name != name) {
        io.emit('chat message', 'black', socket.name, `changed name to ${name}`)
        // Change the player with this name.
        for (var i = 0; i < game.players.length; ++i)
        {
          if (game.players[i].name == socket.name)
          {
            game.players[i].name = name;
            // TODO Force a refresh of the client's board.
            io.emit('refresh');
            break;
          }
        }
        socket.name = name;
      }
      // Only emit messages, not blanks.
      if (msg.length) {
        io.emit('chat message', socket.color, socket.name, msg);
      }
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

function CountOccurrencesOfEachValue() {
    var counts = [ 0, 0, 0, 0, 0, 0 ]; // Occurrences of 1s..6s in index 0..5, respectively.
    for (var i = 0; i < 5; ++i) {
        var value = game.state.die[i].value;
        counts[value-1]++;
    }
    return counts;
}

function CountOccurrencesOfValue(value) {
    var score = 0;
    for (var i = 0; i < 5; ++i) {
        if (game.state.die[i].value == value) {
            score += value;
        }
    }
    return score;
}

function Count(required) {
    // Count how many of each die there is.
    var sum = 0; // just in case we end up scoring this we might as well sum up the dice along the way.
    var scoreit = false;
    var counts = [ 0, 0, 0, 0, 0, 0, 0 ]; // We only use [1] through [6]
    for (var i = 0; i < 5; ++i) {
        var value = game.state.die[i].value;
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

function FullHouse() {
    var score = 0;
    var have2 = false;
    var have3 = false;
    var counts = CountOccurrencesOfEachValue();
    for (var i = 0; i < counts.length; ++i) {
        if (counts[i] >= 3 || counts[i] == 5) {
            if (counts[i] == 5) {
                ; // TODO handle yatc bonus.
            }
            have3 = true;
        } else if (counts[i] >= 2) {
            have2 = true;
        }
    }
    if (have2 && have3) {
        score = 25;
    }
    return score;
}

function Straight(required_in_a_row) {
    var score = 0;
    var counts = CountOccurrencesOfEachValue();
    if (required_in_a_row == 4) {
        if (counts[0] == 5 || counts[1] == 5 || counts[2] == 5 || counts[3] == 5 || counts[4] == 5 || counts[5] == 5) {
            score = 30; // TODO handle yatc bonus.
        } else if (counts[0] && counts[1] && counts[2] && counts[3]) {
            score = 30;
        } else if (counts[1] && counts[2] && counts[3] && counts[4]) {
            score = 30;
        } else if (counts[2] && counts[3] && counts[4] && counts[5]) {
            score = 30;
        }
    } else if (required_in_a_row == 5) {
        if (counts[0] == 5 || counts[1] == 5 || counts[2] == 5 || counts[3] == 5 || counts[4] == 5 || counts[5] == 5) {
            score = 40; // TODO handle yatc bonus.
        } else if (counts[0] && counts[1] && counts[2] && counts[3] && counts[4]) {
            score = 40;
        } else if (counts[1] && counts[2] && counts[3] && counts[4] && counts[5]) {
            score = 40;
        }
    }
    return score;
}

function Score(id) {
    if (game.state.rounds > 13) {
        console.error('Score('+id+') trying to score past round 13.');
        return false;
    }

    var player = game.players[game.state.player];
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
            player.categories[id].score = CountOccurrencesOfValue(id+1);
            break;
        case 8: // 3 of kind
            player.categories[id].score = Count(3);
            break;
        case 9: // 4 of kind
            player.categories[id].score = Count(4);
            break;
        case 10: // full house
            player.categories[id].score = FullHouse();
            break;
        case 11: // sm straight
            player.categories[id].score = Straight(4);
            break;
        case 12: // lg straight
            player.categories[id].score = Straight(5);
            break;
        case 13: // yatc
            player.categories[id].score = Count(5);
            break;
        case 14: // chance
            player.categories[id].score = Count(0);
            break;
        default:
            break;
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
}

////
////    require('./player.js');
////
function Player(name) {
    this.name = name;
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
        this.categories[15].score = 0; // TODO yatc bonus
        this.categories[16].score = this.categories[15].score + bottotal;
        this.categories[17].score = this.categories[7].score + this.categories[16].score;
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
    this.state = new State();
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
  res.send(JSON.stringify(game.state, null, 3));
});

app.get('/players', function (req,res) {
  res.send(JSON.stringify(game.players, null, 3));
});

app.get('/roll', function (req,res) {
  // Protect against the client cheating and trying to roll more than 3 times.
  var q = url.parse(req.url, true);
  if (game.state.rolls < 3) {
    var dieString = q.search.substring(1);
    var die = JSON.parse(dieString.replace(/%22/g, '"'));
    game.state.rolls++;
    for (var i = 0; i < 5; ++i) {
        if (die[i].roll) {
            game.state.die[i].value = Roll();
        }
    }
    res.send(JSON.stringify(game.state, null, 3));
  } else {
    next(400);
  }
});

app.get('/score', function (req,res) {
  var scoreString = q.search.substring(1);
  var category = JSON.parse(scoreString.replace(/%22/g, '"'));
  // console.log('score=' + category);
  var ok = Score(category);
  if (ok) {
    // Now, do game maintenance.
    game.state.die = [
        new Dice(),
        new Dice(),
        new Dice(),
        new Dice(),
        new Dice()
    ];
    game.state.rolls = 0;
    game.state.player++;
    if (game.state.player >= game.players.length) {
        game.state.player = 0;
        game.state.rounds++;
        if (game.state.rounds >= 13) {
            ; // Game is over.
        }
    }
    res.send(JSON.stringify(game, null, 3));
  } else {
    next(400);
  }
});

app.get('/refresh', function (req,res) {
  res.send(JSON.stringify(game, null, 3));
});

app.get('/restart', function (req,res) {
  game = new Game();
  res.send(JSON.stringify(game, null, 3));
});

/*
var url = require('url');
var fs = require('fs');
var http = require('http');
var PORT = 4567; 
function serveFile(filename, type, response) {
    fs.readFile(filename, function(error, content) {
            if (error) {
                response.writeHead(500);
                response.end();
            } else {
                response.writeHead(200, {'Content-Type': type});
                response.end(content, 'utf-8');
            }
        });
}

function handleRequest(request, response) {
    try {
        // console.log(request.url);
        var q = url.parse(request.url, true);

        if (q.pathname == '/') {
            serveFile('./index.html', 'text/html', response);

        } else if (q.pathname == '/favicon.ico') {
            serveFile('./favicon.ico', 'image/x-icon', response);

        } else if (q.pathname == '/client.js') {
            serveFile('./client.js', 'text/javascript', response);

        } else if (q.pathname == '/styles.css') {
            serveFile('./styles.css', 'text/css', response);

        } else if (q.pathname == '/0.png'
                || q.pathname == '/1.png' || q.pathname == '/2.png' || q.pathname == '/3.png' || q.pathname == '/4.png' || q.pathname == '/5.png' || q.pathname == '/6.png'
                || q.pathname == '/1k.png' || q.pathname == '/2k.png' || q.pathname == '/3k.png' || q.pathname == '/4k.png' || q.pathname == '/5k.png' || q.pathname == '/6k.png') {
            serveFile(q.pathname.substring(1), 'image/png', response);

        } else if (q.pathname == '/catnames') {
            response.writeHead(200, {'Content-Type': 'application/json'});
            var catString = JSON.stringify(catNames, null, 3);
            response.end(catString);

        } else if (q.pathname == '/catclasses') {
            response.writeHead(200, {'Content-Type': 'application/json'});
            var catString = JSON.stringify(catClasses, null, 3);
            response.end(catString);

        } else if (q.pathname == '/players') {
            response.writeHead(200, {'Content-Type': 'application/json'});
            var playersString = JSON.stringify(game.players, null, 3);
            response.end(playersString);

        } else if (q.pathname == '/state') {
            response.writeHead(200, {'Content-Type': 'application/json'});
            var stateString = JSON.stringify(game.state, null, 3);
            response.end(stateString);

        } else if (q.pathname == '/message') {
            var message = q.search.substring(1);
            response.writeHead(200, {'Content-Type': 'application/json'});
            response.end(message);

        } else if (q.pathname == '/roll') {
            // Protect against the client cheating and trying to roll more than 3 times.
            if (game.state.rolls < 3) {
                var dieString = q.search.substring(1);
                var die = JSON.parse(dieString.replace(/%22/g, '"'));
                game.state.rolls++;
                for (var i = 0; i < 5; ++i) {
                    if (die[i].roll) {
                        game.state.die[i].value = Roll();
                    }
                }
                var stateString = JSON.stringify(game.state, null, 3);
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(stateString);
            } else {
                response.writeHead(400);
                response.end();
            }

        } else if(q.pathname == '/score') {
            var scoreString = q.search.substring(1);
            var category = JSON.parse(scoreString.replace(/%22/g, '"'));
            // console.log('score=' + category);
            var ok = Score(category);
            if (ok) {
                // Now, do game maintenance.
                game.state.die = [
                    new Dice(),
                    new Dice(),
                    new Dice(),
                    new Dice(),
                    new Dice()
                ];
                game.state.rolls = 0;
                game.state.player++;
                if (game.state.player >= game.players.length) {
                    game.state.player = 0;
                    game.state.rounds++;
                    if (game.state.rounds >= 13) {
                        ; // Game is over.
                    }
                }
                var gameString = JSON.stringify(game, null, 3);
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(gameString);
            } else {
                response.writeHead(400);
                response.end();
            }

        } else if(q.pathname == '/refresh') {
            var gameString = JSON.stringify(game, null, 3);
            response.writeHead(200, {'Content-Type': 'application/json'});
            response.end(gameString);

        } else if(q.pathname == '/restart') {
            game = new Game();
            var gameString = JSON.stringify(game, null, 3);
            response.writeHead(200, {'Content-Type': 'application/json'});
            response.end(gameString);

        } else {
            response.writeHead(500);
            response.end();
        }
    } catch(err) {
        console.error(err);
    }
}

var server = http.createServer(handleRequest);

server.listen(PORT, function() {
    // console.log('Server listening on http://localhost:%s', PORT);
    });
*/
