// container.js
function container(defaultObject) {

    if (!(this instanceof container)) {
        return new container(defaultObject);
    }
    
    if(!defaultObject) {
        defaultObject = {
            id: ''
        };
    }
    
    this.id = null;
    this.array = [];
    this.defaultObject = defaultObject;
};

container.prototype.find = function find(object_id) {
    return this.array[object_id];
};

container.prototype.add = function add(object) {
    var id = object.id;
    // id가 없다면 임의로 지정
    if(!object.id){
        id = 'data_' + this.array.length;
    }
    // 이미 존재한다면 생성 실패
    if( !!this.array[id] ){
        return console.error('이미 존재하는 id값입니다.');
    }
    this.array[id] = object;
};
    
container.prototype.remove = function remove(object_id) {
    delete this.array[object_id];
};
    
container.prototype.list = function list() {
    return Object.keys(this.array);
};

container.prototype.arrays = function arrays() {
    return this.array;
};

module.exports = container;