/* vim:set ts=2 sw=2 expandtab: */

$(function () {
  var socket = io();
  $('form').submit(function() {
    socket.emit('chat message', $('#n').val(), $('#m').val());
    $('#m').val('');
    return false;
  });
  socket.on('chat message', function(color, name, msg) {
    $('#messages').append($(`<li style="color:${color}">`).text(`${name}: ${msg}`));
    window.scrollTo(0, document.body.scrollHeight);
  });
  socket.on('name failed', function() {
    $('#n').val('');
  });
  socket.on('refresh', function() {
    onRefresh();
  });
});

function Dice(id) {
    this.id = id;
    this.value = 0;
    this.roll = true;
}

function State() {
    this.rounds = 0; // How many rounds have been played?
    this.rolls = 0;  // How many rolls has the current player done?
    this.die = [
        new Dice('dice0'),
        new Dice('dice1'),
        new Dice('dice2'),
        new Dice('dice3'),
        new Dice('dice4')
    ];
}

var state = new State();
var players = [];
var catNames = [];
var catClasses = [];

function httpGetAsync(url, success, failure) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        // console.log('httpGetAsync() readyState=' + xmlHttp.readyState + ' status=' + xmlHttp.status);
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
            success(xmlHttp.responseText);
        } else if (xmlHttp.readyState == 4 && xmlHttp.status != 200) {
            failure(xmlHttp.status);
        }
    }
    xmlHttp.open('GET', url, true);
    xmlHttp.send(null);
}

function initialize() {
    // console.log('initialize()');
    httpGetAsync('/catnames',
            function(response) {
                catNames = JSON.parse(response);

                httpGetAsync('/catclasses',
                        function(response) {
                            catClasses = JSON.parse(response);

                            var name = $('#n').val();
                            httpGetAsync(`/state?name=${name}`,
                                    function(response) {
                                        state = JSON.parse(response);

                                        httpGetAsync('/players',
                                                function(response) {
                                                    players = JSON.parse(response);

                                                    drawBoard();
                                                },
                                                function(error) {
                                                    console.error('initialize() GET /players status=' + error);
                                                });
                                    },
                                    function(error) {
                                        console.error('initialize() GET /state status=' + error);
                                    });
                        },
                        function(error) {
                            console.error('initialize() GET /catclasses status=' + error);
                        });
            },
            function(error) {
                console.error('initialize() GET /catnames status=' + error);
            });
}

// TODO Only do this full blown '<div><img../></div> stuff at startup then for maintenance just change the image based on the dice's value.
function drawDie() {
    var dice = '';
    dice += '<div>';
    for (var i = 0; i < 5; ++i) {
        var src = '';
        if (state.die[i].roll || !state.die[i].value) {
            src = state.die[i].value + '.png';
        } else {
            src = state.die[i].value + 'k.png';
        }
        dice += '<img id="dice' + i + '" src="' + src + '" onclick="onDiceClick(' + i + ')"/>';
    }
    dice += '</div>';
    document.getElementById('dice').innerHTML = dice;
}

function drawRollRestart() {
    var rollRestart = document.getElementById('rollrestart');
    if ($('#n').val() == '') {
        rollRestart.disabled = true;
        rollRestart.value = 'Roll';
    } else if (state.rounds >= 13) {
        rollRestart.disabled = false;
        rollRestart.value = 'Restart';
    } else if (state.rolls >= 3) {
        rollRestart.disabled = true;
        rollRestart.value = 'Roll';
    } else {
        rollRestart.disabled = false;
        rollRestart.value = 'Roll';
    }
}

function onDiceClick(index) {
    // console.log('onDiceClick(' + index + ')');
    if (state.die[index].roll) {
        state.die[index].roll = false;
    } else {
        state.die[index].roll = true;
    }

    drawDie();
}

function onCategory(cat=-1) {
    // console.log('onCategory(' + cat + ')');
    if (cat == 0 || cat == 1 || cat == 2 || cat ==3 || cat == 4 || cat == 5) {
        Score(cat);
    } else if (cat == 8 || cat == 9 || cat == 10 || cat == 11 || cat == 12 || cat == 13 || cat == 14) {
        Score(cat);
    }
}

function onRollRestart() {
    // console.log('onRollRestart()');
    var rollRestart = document.getElementById('rollrestart');
    if (rollRestart.value == 'Restart') {
        var name = $('#n').val();
        httpGetAsync(`/restart?name=${name}`,
                function(response) {
                    var game = JSON.parse(response); // Server returns whole game on 'score'.
                    players = game.players;
                    var name = $('#n').val();
                    var me = findPlayer(name);
                    state = me.state;
                    drawBoard();
                },
                function(error) {
                    console.error('onRollRestart() GET /restart status=' + error);
                });
    } else {
        var name = $('#n').val();
        var dieString = JSON.stringify(state.die);
        httpGetAsync(`/roll?name=${name}&die=${dieString}`,
                function(response) {
                    // console.log('onRollRestart() response=' + response);
                    // Save old die 'roll' states..
                    var i;
                    var rolls = [ false, false, false, false, false ];
                    for (i = 0; i < state.die.length; ++i) {
                        rolls[i] = state.die[i].roll;
                    }
                    state = JSON.parse(response); // Server returns new state.
                    // Restore die 'roll' states..
                    for (i = 0; i < state.die.length; ++i) {
                        state.die[i].roll = rolls[i];
                    } drawDie();
                    drawRollRestart();
                },
                function(error) {
                    console.error('onRollRestart() GET /roll status=' + error);
                });
    }
}

function onRefresh()
{
    // console.log('onRefresh()');
    httpGetAsync('/refresh',
            function(response) {
                var game = JSON.parse(response); // Server returns whole game on 'refresh'.

                // Save old die 'roll' states..
                var i;
                var rolls = [ false, false, false, false, false ];
                for (i = 0; i < state.die.length; ++i) {
                    rolls[i] = state.die[i].roll;
                }

                players = game.players;
                var name = $('#n').val();
                var me = findPlayer(name);
                state = me.state;

                // Restore die 'roll' states..
                for (i = 0; i < state.die.length; ++i) {
                    state.die[i].roll = rolls[i];
                }

                drawDie();
                drawBoard();
            },
            function(error) {
                console.error('onRollRestart() GET /refresh status=' + error);
            });
}

function Score(id = -1) { // console.log('Score(' + id + ')');
    // Specifying the category of -1 means score the first available unscored category.
    var name = $('#n').val();
    httpGetAsync(`/score?name=${name}&id=${id}`,
            function(response) {
                // console.log('Score() response=' + response);
                game = JSON.parse(response); // Server returns whole game on 'score'.
                players = game.players;
                var me = findPlayer(name);
                state = me.state;
                drawBoard();
            },
            function(error) {
                console.error('Score() GET /score status=' + error);
            });
}

function findPlayer(name)
{
  for (var i = 0; i < players.length; ++i) {
    if (players[i].name == name) {
      return players[i];
    }
  }
  return undefined;
}
 
function drawBoard() {
    // console.log('drawBoard()');
    var columns = 1 + players.length;

    var table = '';
    ////    table += '<div style="overflow-x:auto;">';
    table += '<table>';

    // Row 1 - Header.
    table += '  <tr>';
    table += '    <th class="turn">Turn</th>';
    for (var i = 0; i < players.length; ++i) {
      table += `    <th style="color: white; background-color: ${players[i].color};">${players[i].name}</th>`;
    }
    table += '  </tr>'; 
    // Rows 2-n - Scores and Totals.
    for (var i = 0; i < catNames.length; ++i)
    {
        table += '  <tr id="cat' + i + '" onclick="onCategory(' + i + ')">';
        table += '    <td class="' + catClasses[i] + '">' + catNames[i] + '</td>';
        for (var j = 0; j < players.length; ++j)
        {
            let score = '';
            if (players[j].categories[i].taken == true) {
                score = players[j].categories[i].score;
            }
            let _class = '';
            if (i == 6 || i == 7 || i >= 15) {
              // This is a total score.
              _class = catClasses[i];
            } else {
              // This is a turn score.
              _class = '';
            }
            table += `    <td class="${_class}" align="right">${score}</td>`;
        }
        table += '  </tr>';
    }

    table += '</table>';
    ////    table += '</div>';

    document.getElementById('board').innerHTML = table;

    drawDie();
    drawRollRestart();
}
