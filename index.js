var express = require('express');
var app = express()
  , http = require('http')
  , server = http.createServer(app)
  , io = require('socket.io').listen(server);
  
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');
var Container = require('./objects/container.js');
var Room = require('./objects/room.js');
var Stopwatch = require('timer-stopwatch');

var portNumber = 8080;

var roomContainer = Container();

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

app.get('/room/:room', function(req, res){
	try {
		var room = roomContainer.find(req.param('room')).publicData();
		res.send( JSON.stringify(room) );
	} catch(e){
		res.status(404).send('404 not found');
	}
});

app.get('/room/:room/users', function(req, res){
	try {
		var room = roomContainer.find(req.param('room'));
		var userlist = [];
		for(var user in room.users){
			userlist.push({
				id: user,
				drawer: room.drawer == user,
				owner: room.owner == user
			});
		}
		res.send( userlist );
	} catch(e){
		res.status(404).send('404 not found');
	}
});

server.listen(portNumber, function(){
	console.log('Server is listening on port %d', portNumber);
});

// 소켓 서버 생성 및 실행
io.sockets.on('connection', function(socket){
	
	var user = {
		username: '',
		disconnected: false,
		getUsername: function(){
			if(!this.username){
				this.username = socket.id.substr(3,7);
			}
			return this.username;
		}
	};
	
	var room = null;

	var game_timer_fulltime = 60 * 1000;
	var game_timer_options = {
		refreshRateMS: 90,      // How often the clock should be updated
		almostDoneMS: 10000,     // When counting down - this event will fire with this many milliseconds remaining on the clock
	}
	var game_timer = new Stopwatch(60 * 1000, game_timer_options);

	// join 이벤트
	socket.on('join', function(id){
		socket.join(id);
		
		var username = user.getUsername();
		
		room = roomContainer.find(id);
		
		// 해당 id의 room이 존재한다면
		if(!!room){
			room.join(socket, username);
			user.disconnected = false;
			io.sockets.in(room.id).emit('update userlist');
			
			game_timer.onTime(function(time) {
				io.sockets.in(room.id).emit('update timer tick', time.ms, game_timer_fulltime);
				room.state = 'gaming';
				console.log('게임 진행....', time.ms);
			}).onDone(function(time) {
				console.log('게임 종료');
				room.state = 'wait';
			});
		}
	});
	
	socket.on('disconnect', function(){
		var username = user.getUsername();
		user.disconnected = true;
		
		if( !room ) return false;
		
		setTimeout(function(){
			if(user.disconnected){
				try {
					var userCount = room.kick(socket, user.getUsername());
					
					if( userCount < 1 ){
						// 모든 유저가 나갔음 (방이 비었다)
						socket.emit('exit room');
						roomContainer.remove(room.id);
						room = null;
						return true;
					}
				} catch(e){
					console.log(e);
				}
				
				socket.leave(room.id);
				io.sockets.in(room.id).emit('update userlist');
			}
		}, 2 * 1000);
	})
	
	// room 이벤트
	socket.on('send line', function(data){
		room.draw(user.getUsername(), data);
	});
	
	socket.on('save canvas', function(image){
		room.saveImage(image);
	});
	
	socket.on('restore state', function(data){
		// data가 있다면 서버의 그림판 상태를 갱신한다.
		if(!!data){
			room.capturedImage = data;
		}
		// 없다면 기존의 이미지를 가져온다
		// 클라이언트쪽에 갱신된 상태를 새로 그리도록 전송
		try {
			io.sockets.in(room.id).emit('render canvas', room.capturedImage);
		} catch (err) {
			// 방이 없는 경우
			socket.emit('error message', '존재하지 않거나 잘못된 접근입니다.');
		}
	});
	
	// addroom
	socket.on('addroom', function(id){
		roomContainer.add(new Room(id, io));
		io.sockets.emit('addroom', id);
	});
	
	////////////////// chat ///////////////////
	socket.on('sendMessage', function(content){
		room.echo(socket, 'chat', user.getUsername(), content);
	});
	
	socket.on('start game', function(){
		console.log(game_timer, room.state);
		if( game_timer.state != 1 && room.state != 'gaming' ){
			game_timer.reset(game_timer_fulltime);
			io.sockets.in(room.id).emit('update timer tick', game_timer_fulltime, game_timer_fulltime);
			game_timer.start();
		} else {
			console.log('게임 시작 불가');
		}
	});
	////////////////// 그림을 그릴 수 있는 권한을 넘긴다. ///////////////////
	
});