var express = require('express');
var app = express()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server);
  
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');

var portNumber = 8080;

var roomArray = [];

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use('/static', express.static('public'));

app.get('/', function(req, res){
	res.render('lobby.ejs', {title: 'hello'});
});

app.get('/canvas/:room', function(req, res){
	res.render('canvas.ejs', {room: req.param('room')});
});

app.get('/room', function(req, res){
	res.send(JSON.stringify(roomArray));
});

var searchRoom = function (id){
	for(var i in roomArray){
		if(id == roomArray[i].id) return roomArray[i];
	}
	return undefined;
};
	
app.get('/room/:room/users', function(req, res){
	var users = searchRoom(req.param('room')).users;
	var userlist = [];
	for(var user in users){
		userlist.push(user);
	}
	res.send( userlist );
});

server.listen(portNumber, function(){
	console.log('Server is listening on port %d', portNumber);
});

// 소켓 서버 생성 및 실행
io.set('log level', 2);
io.sockets.on('connection', function(socket){

	// join 이벤트
	socket.on('join', function(data){
		socket.join(data);
		
		if(!socket.username){
			socket.username = socket.id.substr(3,7);
		}
		
		var room = searchRoom(data);
		// 해당 id의 room이 존재한다면
		if(!!room){
			room.users[socket.username] = true;
			
			socket.room = room;
			socket.emit('render canvas', room.capturedImage);
			socket.emit('connected', socket.username);
			
			socket.emit('recvMessage', 'SYSTEM', '[' + socket.room.id +']에 입장하였습니다.');
			socket.broadcast.emit('recvMessage', socket.username, '[' + socket.username +']님이 입장하셨습니다.');
			
			io.sockets.in(socket.room.id).emit('update userlist', socket.username);
		}
	});
	
	socket.on('disconnect', function(){
		if(!socket.username){
			socket.username = socket.id.substr(3,7);
		}
		
		try {
			delete socket.room.users[socket.username];
		} catch(e){
			console.log(e);
		}
		
		socket.broadcast.emit('recvMessage', socket.username, '[' + socket.username +']님이 퇴장하셨습니다.');
		
		try {
			io.sockets.in(socket.room.id).emit('update userlist');
		} catch(e){
			console.log(e);
		}
	})
	
	// room 이벤트
	socket.on('send line', function(data){
		io.sockets.in(socket.room.id).emit('draw line', data);
	});
	
	socket.on('save canvas', function(image){
		socket.room.capturedImage = image;
	});
	
	socket.on('restore state', function(data){
		// data가 있다면 서버의 그림판 상태를 갱신한다.
		if(!!data){
			socket.room.capturedImage = data;
		}
		// 없다면 기존의 이미지를 가져온다
		// 클라이언트쪽에 갱신된 상태를 새로 그리도록 전송
		try {
			io.sockets.in(socket.room.id).emit('render canvas', socket.room.capturedImage);
		} catch (err) {
			// 방이 없는 경우
			socket.emit('error message', '존재하지 않거나 잘못된 접근입니다.');
		}
	});
	
	// addroom
	socket.on('addroom', function(data){
		var el = {
			id: data,
			users: [],
			capturedImage: '',
			createdAt: new Date()
		};
		roomArray.push(el);
		io.sockets.emit('addroom', data);
	});
	
	////////////////// chat ///////////////////
	socket.on('sendMessage', function(content){
		io.sockets.in(socket.room.id).emit('recvMessage', socket.username, content);
	});
});