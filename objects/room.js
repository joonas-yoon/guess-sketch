// room.js
function room(id, socketio) {

    if (!(this instanceof room)) {
        return new room(id, socketio);
    }
    
    if(!id) {
        id = Math.random().toString(36).substr(2, 5);
    }
    
    this.id = id;
    this.io = socketio;
    
    this.state = 'wait';
    this.password = '';
    this.capturedImage = '';
    this.owner = '';
    this.drawer = '';
    this.users = []; // user들의 id만 저장함
    
    this.capturedImage = '';
    this.createdAt = new Date();
};

room.prototype.publicData = function publicData() {
    return {
        id: this.id,
        state: this.state,
        owner: this.owner,
        users: this.users,
        createdAt: this.createdAt
    };
};

room.prototype.draw = function draw(drawer, data) {
    if(drawer == this.drawer){
        this.io.sockets.in(this.id).emit('draw line', data);
        return true;
    }
    return false;
};

room.prototype.saveImage = function saveImage(image) {
	this.capturedImage = image;
};

room.prototype.echo = function echo(socket, type, username, message) {
    if(type == 'chat'){
        // 일반적인 채팅
        if( username == this.drawer ){
            // 그리는 사람은 대화를 할 수 없다.
            this.echo(socket, 'system', '시스템', '[그림을 그리는 동안은 대화를 할 수 없습니다.]');
        } else {
            this.io.sockets.in(this.id).emit('recvMessage', username, message);
        }
    }
    else if(type == 'notice'){
        // (방에 상관없이) 모든 사람에게 공지
        this.io.sockets.emit('recvMessage', username, message);
    }
    else if(type == 'broadcast'){
        // 자신 이외에게 공지
        socket.broadcast.to(this.id).emit('recvMessage', username, message);
    }
    else if(type == 'system'){
        // 개인에게 알림
        socket.emit('recvMessage', username, message);
    }
};

room.prototype.join = function join(socket, user_id) {
    this.users[user_id] = true;
    this.echo(socket, 'system', '시스템', '[' + this.id +']방에 입장하였습니다.');
    this.echo(socket, 'broadcast', '알림', '[' + user_id +']님이 입장하셨습니다.');
    this.update();
};

room.prototype.kick = function kick(socket, user_id) {
    delete this.users[user_id];
    this.echo(socket, 'broadcast', '알림', '[' + user_id +']님이 퇴장하셨습니다.');
    this.update();
    return this.userlist().length;
};

room.prototype.update = function update(){
    // 상태를 점검하여 변수들을 조정함
    
    // 사람이 아무도 없다면 방의 상태를 변경한다
    if( this.userlist().length < 1 ){
        this.state = 'empty';
        return;
    }
    this.state = 'wait';
    
    // 방장이 없다면(나간 상태) 남은 다음 사람이 인계함
    if( ! this.users[this.owner] ){
        this.owner = this.nextUser(this.owner);
    }
    
    // 그림 그리는 사람도 변경해줌
    if( ! this.users[this.drawer] ){
        this.drawer = this.nextUser(this.drawer);
    }
};

room.prototype.nextUser = function nextUser(user_id){
    var list = this.userlist();
    if(list.length < 1) return undefined;
    
    var idx = list.indexOf(user_id);
    if(idx < 0)
        return list[0];
    else
        return list[(idx+1)%list.length];
};

room.prototype.userlist = function userlist(){
    return Object.keys(this.users);
};

module.exports = room;