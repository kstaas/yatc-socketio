var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

// server selects color.
var cindex = 0;
var colors = [ 'red', 'blue', 'green', 'orange', 'cyan', 'pink', 'purple' ];

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket) {
  socket.on('chat message', function(name, msg) {
    // Unless there is a name, do nothing!
    if (name.length) {
      // If there's no name associated with this socket yet, then associate this name.
      if (socket.name == undefined) {
        socket.name = name;
        socket.color = colors[cindex];
        cindex = (cindex + 1) % colors.length;
      }
      // If this name is different than the name that associated with this socket then announce that fact.
      if (socket.name != name) {
        io.emit('chat message', 'black', socket.name, `changed name to ${name}`)
        socket.name = name;
      }
      // Only emit messages, not blanks.
      if (msg.length) {
        io.emit('chat message', socket.color, socket.name, msg);
      }
    }
  });
});

http.listen(port, function() {
  console.log('listening on *:' + port);
});
