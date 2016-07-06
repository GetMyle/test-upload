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

fs.ensureDirSync(sharesDirPath);


function execute(command, res, callback) {
    exec(command, function(error, stdout, stderr) {
        if (error) {
            return sendError(res, error.stack);
        }
        callback(stdout);
    });
};


function getImageFilter(req) {
    const urlParsed = url.parse(req.url, true);
    console.log(req.url, urlParsed);

    const fwVersion = parseVersion(urlParsed.query.fw);
    const hwVersion = parseVersion(urlParsed.query.hw);
    return function (f) {
        if (!f.name) {
            return false;
        }

        const imageVersion = parseVersion(f.version);

        // 1. show only images with the same major number as in request
        if (imageVersion.major != fwVersion.major) {
            return false;
        }

        // 2. show only images with the greater minor and patch
        if (imageVersion.minor > fwVersion.minor) {
            return true;
        }
        if (imageVersion.minor === fwVersion.minor) {
            return (imageVersion.patch > fwVersion.patch);
        }
        return false;
    };
}


function parseVersion(str) {
    const version = str.split('.');
    if (version.length !== 3) { return; }

    return {
        major: parseInt(version[0]),
        minor: parseInt(version[1]),
        patch: parseInt(version[2])
    };
}


function index(req, res, json) {
    fs.readdir(sharesDirPath, function(err, files) {
        if (err) {
            return sendError(err.stack);
        }
        files.sort().reverse();
        if (json) {
            json = files.map(f => {
                const c = f.split(' - ');
                return {
                    id: f,
                    time: c[0],
                    name: c[1],
                    version: c[2],
                    metadata: c[3]
                };
            })
            .filter(getImageFilter(req))
            .map(f => {
                f.metadata = f.metadata.split('.')[0];
                return f;
            });
            json = JSON.stringify(json);
            res.writeHead(200, {
                'Content-Length': json.length,
                'Content-Type': 'application/json' });
            res.end(json);
        } else {
            const links = files.map(f => `<a href="?file=${f}">${f}</a><br/>`).join('');

            var html = '<html><head><!-- Latest compiled and minified CSS --><link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css" integrity="sha384-1q8mTJOASx8j1Au+a5WDVnPi2lkFfwwEAa8hDDdjZlpLegxhjVME1fgjWPGmkzs7" crossorigin="anonymous"></head><body><form method="POST" enctype="multipart/form-data"><input type="text" placeholder="version, ex. 1.0.4" name="version" required><br><input type="file" name="image" required><br><input type="submit" value="Upload"></form><hr>' + links + '</body></html>';
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

function create(req, res) {
    var form = new formidable.IncomingForm();

    form.parse(req, function(err, fields, files) {
        const version = parseVersion(fields.version);
        if (!version) {
            return sendError('Version is expected to be in format major.minor.patch');
        }
        if (isNaN(version.major) || isNaN(version.minor) || isNaN(version.patch)) {
            return sendError('Version component is expected to be a number');
        }

        execute('./hex2bin "' + files.image.path + '" "' + files.image.path + '.bin"', res, function (metadata) {
            let majorHex = version.major.toString(16);
            majorHex = majorHex.length > 1 ? majorHex.substr(0, 2) : "0" + majorHex;
            let minorHex = version.minor.toString(16);
            minorHex = minorHex.length > 1 ? minorHex.substr(0, 2) : "0" + minorHex;
            let patchHex = version.patch.toString(16);
            patchHex = patchHex.length > 1 ? patchHex.substr(0, 2) : "0" + patchHex;

            metadata = metadata.substr(0, 4) + majorHex + minorHex + patchHex + metadata.substr(10);

            const sharePath = path.join(sharesDirPath, new Date().toISOString() + ' - ' + files.image.name + ' - ' + [version.major, version.minor, version.patch].join('.') + ' - ' + metadata.trim() + '.bin');
            console.log(sharePath);
            fs.renameSync(files.image.path + '.bin', sharePath);
            res.writeHead(302, { 'Location': '/' });
            res.end();
        });
    });
}


function download(urlParsed, res) {
    fs.readFile(path.join(sharesDirPath, urlParsed.query.file), function(err, data) {
        if (err) {
            return sendError(err.stack);
        }
        res.writeHead(200, {'Content-Length': data.length, 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'filename="' + urlParsed.query.file + '"'});
        res.end(data, 'binary');
    });
}

var proxy = http.createServer((req, res) => {
    const urlParsed = url.parse(req.url, true);
    if (urlParsed.pathname === '/json') {
        index(req, res, true);
    } else
    if (urlParsed.pathname === '/') {
        switch (req.method) {
            case 'GET': {
                if (urlParsed.query.file) {
                    download(urlParsed, res);
                } else {
                    index(req, res);
                }
                break;
            }
            case 'POST': {
                create(req, res);
                break;
            }
        }
    }
});

// now that proxy is running
proxy.listen(5681);