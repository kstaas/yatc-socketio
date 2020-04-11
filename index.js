var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket) {
  socket.on('chat message', function(name, msg) {
    if (socket.name == undefined) {
      socket.name = name;
    }
    if (socket.name != name) {
      io.emit('chat message', `${socket.name}: changed name to ${name}`)
      socket.name = name;
    }
    io.emit('chat message', `${name}: ${msg}`);
  });
});

http.listen(port, function() {
  console.log('listening on *:' + port);
});