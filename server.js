/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var path = require('path');
var url = require('url');
var express = require('express');
var ws = require('ws');
var fs    = require('fs');
var https = require('http');

var argv = {
        as_uri: 'https://localhost:8443/',
};

/*

var options =
{
  key:  fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt')
};

*/

var app = express();
var userRegistry = new UserRegistry();

/*
 * Server startup
 */
var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = https.createServer(app).listen(port, function() {
    console.log('Sever socket for creating web socket created.');
});

var wss = new ws.Server({
    server : server,
    path : '/camera'
});

function UserRegistry(){
	this.usersByName = {};
}

UserRegistry.prototype.register = function(user){
	this.usersByName[user.name] = user;
}

UserRegistry.prototype.getByName = function(name) {
    return this.usersByName[name];
}

// Represents user sessions
function UserSession(name, ws) {
    this.name = name;
    this.ws = ws;
    this.peer = null;
    this.sdpOffer = null;
}

UserSession.prototype.sendMessage = function(message) {
    this.ws.send(JSON.stringify(message));
}


/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws) {
    
    console.log("WSS connected. ");

    ws.on('error', function(error) {
        console.log('Connection  error');
    });

    ws.on('close', function() {
        console.log('Connection  closed');
    });

    ws.on('message', function(_message) {
	    console.log(_message);
        var message = JSON.parse(_message);
        console.log('Received message ', message);

        switch (message.id) {
	
	    case 'register':
	       register(message.id, message.name, message.isKMS, ws);
	       break;

        case 'sdpOffer':
           console.log("Received sdpOffer from " + message.name);
           var kms = userRegistry.getByName('kms');
           if(kms){
                console.log("Forwarding to kms.");
                kms.sendMessage(message);
            }
        break;

        case 'iceCandidate':
            if (message.name == 'kms'){
                var peer = userRegistry.getByName('peer');
                if (peer){
                    console.log("Forwarding to peer.")
                    peer.sendMessage(message);
                }
            }else{
                var kms = userRegistry.getByName('kms');
                if (kms){
                    console.log("Forwarding to kms.")
                    kms.sendMessage(message);
                }
            }
        break;

        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }

    });
});

function register(id, name, isKMS, ws, callback) {
    function onError(error) {
        ws.send(JSON.stringify({id:'registerResponse', response : 'rejected ', message: error}));
    }
    
    console.log("Registering... ");

    if (!name) {
        return onError("empty user name");
    }

    if (userRegistry.getByName(name)) {
        return onError("User " + name + " is already registered");
    }

    if (name == 'kms' && !isKMS){
	return onError("User " + name + " has name kms but is not kms");
    }

    userRegistry.register(new UserSession(name, ws));
    try {
        ws.send(JSON.stringify({id: 'registerResponse', response: 'accepted'}));
    } catch(exception) {
        onError(exception);
    }
}
