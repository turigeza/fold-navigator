// ES6 use these for collections instead of objects
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
var map = new Map([["key1", "value1"], ["key2", "value2"]]);

map.set('key', 'value');
map.set('key2', 'newvalue2');
var someobj = {};
map.set(someobj, 'objvalue');
map.set({}, 'newobjvalue'); // this is not the same as someobj and will not change because {} !== someobj
map.set(NaN, 'NaNvalue');
map.set(NaN, 'NewNaNvalue'); // this will change even thought NaN !== NaN :))

if(someobj !== {}){
    log('yes');
}
log(map.get(someobj, 'yellow'));
log(map, 'red');
