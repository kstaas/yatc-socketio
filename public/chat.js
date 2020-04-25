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
});

