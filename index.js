var express = require('express');
var app = express()
	, http = require('http')
	, server = http.createServer(app)
	, io = require('socket.io').listen(server);
	
var bodyParser   = require('body-parser');
var cookieParser = require('cookie-parser');
var mongoose     = require('mongoose');
var passport     = require('passport');
var session      = require('express-session');
var flash        = require('connect-flash');
var async        = require('async');
var Container    = require('./objects/container.js');
var Room         = require('./objects/room.js');
var Stopwatch    = require('timer-stopwatch');

var portNumber = process.env.PORT || 8080;

var roomContainer = Container();

mongoose.connect(process.env.MONGO_DB);
var db = mongoose.connection;
db.once("open", function(){
	console.log("Mongoose DB connected!");
});
db.on('error', function(err){
	console.log("DB Error: ", err);
});

var userSchema = mongoose.Schema({
	username: { type: String, required: true, index: { unique: true } },
	password: { type: String, required: true },
	// dob: { type: Date, default: Date.now },
	createdAt: { type: Date, default: Date.now },
	count: Number
});

var Users = mongoose.model('users', userSchema);

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use('/dist', express.static('public/dist'));
app.use('/public', express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

// set middlewares
app.use(flash());
app.use(session({secret:'MySecretHash'}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
	done(null, user.id);
});
passport.deserializeUser(function(id, done) {
	Users.findById(id, function(err, user) {
		done(err, user);
	});
});

var LocalStrategy = require('passport-local').Strategy;
passport.use('local-login',
	new LocalStrategy({
		usernameField: 'username',
		passwordField: 'password',
		passReqToCallback: true
	},
	function(req, username, password, done) {
		Users.findOne({ 'username': username }, function(err, user) {
			if(err) return done(err);
			
			if(!user){
				req.flash('username', req.body.username);
				return done(null, false, req.flash('loginError', 'No user found.'));
			}
			if(user.password != password){
				req.flash('username', req.body.username);
				return done(null, false, req.flash('loginError', 'Password does not matched'));
			}
			return done(null, user);
		});
	})
);

// set routers
app.get('/', function(req, res){
	res.render('lobby.ejs', {title: 'hello'});
});

app.get('/login', function(req, res){
	res.render('login.ejs', {
		username: req.flash('username')[0],
		loginError: req.flash('loginError')
	});
});
app.post('/login',
	function(req, res, next){
		req.flash('username');	//flush username data
		if(req.body.username.length === 0 || req.body.password.length === 0){
			req.flash('username', req.body.username);
			req.flash('loginError', 'Please enter both username and password');
			res.redirect('/login');
		} else {
			next();
		}
	}, passport.authenticate('local-login', {
		successRedirect: '/',
		failureRedirect: '/login',
		failureFlash: true
	})
);
app.get('/logout', function(req, res){
	req.logout();
	res.redirect('/login');
});

app.get('/users/new', function(req, res){
	res.render('users/new', {
		formData: req.flash('formData')[0],
		usernameError: req.flash('usernameError')[0],
		passwordError: req.flash('passwordError')[0]
	});
});

app.post('/users', checkUserRegValidation, function(req, res, next){
	Users.create(req.body.user, function(err, user){
		if(err) return res.json({success: false, message: err});
		res.redirect('/login');
	});
});

app.get('/users/:id', function(req, res){
	Users.findById(req.params.id, function(err, user) {
		if(err) return res.json({success: false, message: err});
		res.render("users/show", {user: user});
	});
});

app.get('/users/:id/edit', function(req, res){
	Users.findById(req.params.id, function(err, user) {
		if(err) return res.json({success: false, message: err});
		res.render('users/edit', {
			user: user,
			formData: req.flash('formData')[0],
			usernameError: req.flash('usernameError')[0],
			passwordError: req.flash('passwordError')[0]
		});
	});
});

// update
app.put('/users/:id', checkUserRegValidation, function(req,res){
	Users.findById(req.params.id, req.body.user, function (err,user) {
		if(err) return res.json({success:"false", message:err});
		if(req.body.user.password == user.password){
			if(req.body.user.newPassword){
				req.body.user.password = req.body.user.newPassword;
			} else {
				delete req.body.user.password;
			}
			Users.findByIdAndUpdate(req.params.id, req.body.user, function (err,user) {
				if(err) return res.json({success:"false", message:err});
				res.redirect('/users/'+req.params.id);
			});
		} else {
			req.flash("formData", req.body.user);
			req.flash("passwordError", "- Invalid password");
			res.redirect('/users/'+req.params.id+"/edit");
		}
	});
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

app.get('/users', function(req, res){
	var users = Users.find({}).lean().exec(function(err, result){
		res.send(result);
	});
});

function checkUserRegValidation(req, res, next) {
	var isValid = true;

	async.waterfall(
		[function(callback) {
			Users.findOne({username: req.body.user.username, _id: {$ne: mongoose.Types.ObjectId(req.params.id)}},
				function(err,user){
					if(user){
						isValid = false;
						req.flash("usernameError","- This username is already resistered.");
					}
					callback(null, isValid);
				}
			);
		}], function(err, isValid) {
			if(err) return res.json({success:"false", message:err});
			if(isValid){
				return next();
			} else {
				req.flash("formData",req.body.user);
				res.redirect("back");
			}
		}
	);
}
 
server.listen(portNumber, function(){
	console.log('Server is listening on port %d', portNumber);
});

// 소켓 서버 생성 및 실행
io.sockets.on('connection', function(socket){
	
	var user = Users.findOne({
		username: socket.id.substr(3,7)
	},
	function(err, data){
		if(err) return console.log("Data ERROR:",err);
		if(!data){
			// Users.create({
			// 	username: socket.id.substr(3,7)
			// }, function(err, data) {
				// if(err) return console.log("Data ERROR:", err);
				console.log("initialized :", data);
			// });
		}
	});
	
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
		
		var username = user.username;
		
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
		var username = user.username;
		user.disconnected = true;
		
		if( !room ) return false;
		
		setTimeout(function(){
			if(user.disconnected){
				try {
					var userCount = room.kick(socket, user.username);
					
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
		room.draw(user.username, data);
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
		room.echo(socket, 'chat', user.username, content);
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