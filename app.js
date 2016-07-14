'use strict';

// the server has / endpoint with the following methods:
// - GET lists all available images (JSON, HTML) or downloads a file
// - PUT uploads an image (multipart)

const http = require('http');
const net = require('net');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');

const formidable = require('formidable');
const exec = require('child_process').exec;

const sharesDirPath = path.join(__dirname, 'fw');

const Promise = require('bluebird');
const request = require('request');
const get = Promise.promisify(request.get, { context: request, multiArgs: true });

const apiHost = 'https://api.getmyle.com';




function index(req, res, json) {
    get(apiHost + '/v0/tap-image?fw=*')
        .spread((response, body) => JSON.parse(body))
        .then(images => {
            if (json) {
                json = JSON.stringify(json);
                res.writeHead(200, {
                    'Content-Length': json.length,
                    'Content-Type': 'application/json' });
                res.end(json);
            } else {
                const links = images.map(f => `<a href="${apiHost}/v0/tap-image/${f.id}">${f.version} (${f.time})</a><br/>`).join('');

                var html = '<html><head><!-- Latest compiled and minified CSS --><link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css" integrity="sha384-1q8mTJOASx8j1Au+a5WDVnPi2lkFfwwEAa8hDDdjZlpLegxhjVME1fgjWPGmkzs7" crossorigin="anonymous"></head><body><form method="POST" action="' + apiHost + '/v0/tap-image" enctype="multipart/form-data"><input type="text" placeholder="version, ex. 1.0.4" name="version" required><br><input type="file" name="image" required><br><input type="submit" value="Upload"></form><hr>' + links + '</body></html>';
                res.writeHead(200, {
                    'Content-Length': html.length,
                    'Content-Type': 'text/html' });
                res.end(html);
            }
        });
}

function sendError(res, msg) {
    res.writeHead(500, { 'Content-Length': msg.length, 'Content-Type': 'text/plain' });
    res.end(msg);
};


var proxy = http.createServer((req, res) => {
    const urlParsed = url.parse(req.url, true);
    if (urlParsed.pathname === '/json') {
        index(req, res, true);
    } else
    if (urlParsed.pathname === '/') {
        if (req.method === 'GET') {
            return index(req, res);
        }
        sendError(res, 'Not found');
    }
});

// now that proxy is running
proxy.listen(5681);