var express = require('express');
var app = express()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server);
  
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');
var container = require('./container');

var portNumber = 8080;

var roomContainer = container();

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
	res.send(JSON.stringify(roomContainer.list()));
});

app.get('/room/:room/users', function(req, res){
	try {
		var room = roomContainer.find(req.param('room'));
		var userlist = [];
		for(var user in room.users){
			userlist.push({
				id: user,
				drawer: room.drawer == user
			});
		}
		res.send( userlist );
	} catch(e){
		res.status(404).send('404 not found');
	}
});

app.get('/room/:room', function(req, res){
	try {
		var users = roomContainer.find(req.param('room'));
		res.send( users );
	} catch(e){
		res.status(404).send('404 not found');
	}
});

server.listen(portNumber, function(){
	console.log('Server is listening on port %d', portNumber);
});

// 소켓 서버 생성 및 실행
io.set('log level', 2);
io.sockets.on('connection', function(socket){
	
	var user = {
		username: '',
		disconnected: false,
		isDrawer: function(){
			if(!socket.room) return false;
			return this.username == socket.room.drawer;
		},
		getUsername: function(){
			if(!this.username){
				this.username = socket.id.substr(3,7);
			}
			return this.username;
		}
	};
	
	var timer = {
		runningTime: 60 * 1000,
		time: 0,
		tick: 500 /*ms*/,
		init: function(customRunningTime){
			if(!!customRunningTime) this.runningTime = customRunningTime;
			this.time = this.runningTime;
		},
		start: function(loopEvent, endEvent){
			this.init();
			socket.timer_endEvent = endEvent;
			var stop = this.stop
			  , time = this.time
			  , tick = this.tick;
			socket.timer_stepper = setInterval(function(){
				if(time <= 0){
					stop();
				} else {
					loopEvent(time);
					time -= tick;
				}
			}, this.tick);
		},
		stop: function(){
			clearInterval(socket.timer_stepper);
			try {
				socket.timer_endEvent();
			}catch(e){}
		}
	}

	// join 이벤트
	socket.on('join', function(data){
		socket.join(data);
		
		var username = user.getUsername();
		
		var room = roomContainer.find(data);
		// 해당 id의 room이 존재한다면
		if(!!room){
			room.users[username] = true;
			
			user.disconnected = false;
			
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
		var username = user.getUsername();
		user.disconnected = true;
		
		if( !socket.room ) return false;
		
		setTimeout(function(){
			if(user.disconnected){
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
					roomContainer.remove(socket.room.id);
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
			}
		}, 10 * 1000);
	})
	
	// room 이벤트
	socket.on('send line', function(data){
		if( user.isDrawer() ){
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
		roomContainer.add(el);
		io.sockets.emit('addroom', data);
	});
	
	////////////////// chat ///////////////////
	socket.on('sendMessage', function(content){
		if( user.isDrawer() ){
			// 그리는 사람은 대화를 할 수 없다.
			socket.emit('recvMessage', 'SYSTEM', '[그림을 그리는 동안은 대화를 할 수 없습니다.]');
		} else {
			io.sockets.in(socket.room.id).emit('recvMessage', user.username, content);
		}
	});
	
	socket.on('start game', function(){
		timer.init(5 * 1000);
		timer.start(function(time){
			console.log('진행중....' + time);
		}, function(){
			console.log('종료');
		});
	});
	////////////////// 그림을 그릴 수 있는 권한을 넘긴다. ///////////////////
	
});