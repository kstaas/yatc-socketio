console.log('client: start');

var socket = io('http://localhost');

socket.on('connect', function() {
        console.log('client: on.connect');
        });

socket.on('event', function(data){
        console.log('client: on.event data: ' + data);
        });

socket.on('disconnect', function() {
        console.log('client: on.disconnect');
        });

