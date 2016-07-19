var express = require('express');
var app = express()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server);
  
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');

var portNumber = 8080;

var roomArray = [];

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use('/dist', express.static('public/dist'));
app.use('/public', express.static('public'));

app.get('/', function(req, res){
	res.render('lobby.ejs', {title: 'hello'});
});

app.get('/canvas/:room', function(req, res){
	res.render('canvas.ejs', {room: req.param('room')});
});

app.get('/room', function(req, res){
	var rooms = Object.keys(roomArray);
	var roomsInfo = [];
	for(var i in rooms){
		var key = rooms[i];
		roomsInfo.push(roomArray[key]);
	}
	res.send(JSON.stringify(roomsInfo));
});

var searchRoom = function (id){
	if(roomArray[id]) return roomArray[id];
	return undefined;
};
	
app.get('/room/:room/users', function(req, res){
	try {
		var users = searchRoom(req.param('room')).users;
		var userlist = [];
		for(var user in users){
			userlist.push(user);
		}
		res.send( userlist );
	} catch(e){
		res.status(404).send('404 not found');
	}
});

app.get('/room/:room', function(req, res){
	try {
		var users = searchRoom(req.param('room'));
		res.send( users );
	} catch(e){
		res.status(404).send('404 not found');
	}
});

server.listen(portNumber, function(){
	console.log('Server is listening on port %d', portNumber);
});

var getUsername = function(socket){
	if(!socket.username){
		socket.username = socket.id.substr(3,7);
	}
	return socket.username;
};

// 그림을 그릴 수 있는 지
var isDrawer = function(socket){
	try {
		return getUsername(socket) == socket.room.drawer;
	} catch(e){
	}
	return false;
};

// 소켓 서버 생성 및 실행
io.set('log level', 2);
io.sockets.on('connection', function(socket){

	// join 이벤트
	socket.on('join', function(data){
		socket.join(data);
		
		var username = getUsername(socket);
		
		var room = searchRoom(data);
		// 해당 id의 room이 존재한다면
		if(!!room){
			room.users[username] = true;
			
			socket.room = room;
			socket.emit('render canvas', room.capturedImage);
			socket.emit('connected', username);
			
			socket.emit('recvMessage', 'SYSTEM', '[' + room.id +']에 입장하였습니다.');
			socket.broadcast.emit('recvMessage', username, '[' + username +']님이 입장하셨습니다.');
			
			io.sockets.in(room.id).emit('update userlist', username);
			
			// 방에 아무도 없으면 내가 방장
			var users = Object.keys(room.users);
			if( !room.owner || users.length < 2 ){
				room.owner  = username;
				room.drawer = username;
			}
		}
	});
	
	socket.on('disconnect', function(){
		
		var username = getUsername(socket);
		
		if( !socket.room ) return false;
		
		try {
			delete socket.room.users[username];
		} catch(e){
			console.log(e);
		}
		
		var users = Object.keys(socket.room.users);
		
		socket.leave(socket.room.id);
		
		if( users.length < 1 ){
			// 모든 유저가 나갔음 (방이 비었다)
			socket.emit('exit room');
			delete roomArray[socket.room.id];
			delete socket.room;
			
			return true;
		}
		
		socket.broadcast.emit('recvMessage', username, '[' + username +']님이 퇴장하셨습니다.');
		
		io.sockets.in(socket.room.id).emit('update userlist');
		
		// 나가려는 사람이 방장이면
		if( socket.room.owner == username ){
			// 방장을 인계함
			socket.room.owner = users[0];
			socket.room.drawer = users[0];
		}
	})
	
	// room 이벤트
	socket.on('send line', function(data){
		if( isDrawer(socket) ){
			io.sockets.in(socket.room.id).emit('draw line', data);
		}
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
			owner: '',
			drawer: '',
			gameState: 'wait',
			password: '',
			users: [],
			capturedImage: '',
			createdAt: new Date()
		};
		roomArray[data] = el;
		io.sockets.emit('addroom', data);
	});
	
	////////////////// chat ///////////////////
	socket.on('sendMessage', function(content){
		io.sockets.in(socket.room.id).emit('recvMessage', socket.username, content);
	});
	
	// socket.on('game start', 
	////////////////// 그림을 그릴 수 있는 권한을 넘긴다. ///////////////////
	
});