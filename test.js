const app = require('jest-mustache');

const MustacheHandler = require('./handler');

const inputJPath = null;

describe('Recursively test with files in templates1 folder', function () {
    let isVersioned = true; //out has params like v1, v2 ...
    let paths = ['hello']; //jsonpaths after v1, v2 etc.
    app.testInFolder('templates1', inputJPath, MustacheHandler, isVersioned, paths);
});

describe('Recursively test with files in templates2 folder', function () {
    let isVersioned = false; //out does not have params like v1, v2 ...
    let paths = ['hello']; //jsonpaths after out
    app.testInFolder('templates2', inputJPath, MustacheHandler, isVersioned, paths);
});

describe('Recursively test with files in templates3 folder', function () {
    let isVersioned = true; //out has params like v1, v2 ...
    let paths = ['$..hello', 'hi.bye']; //jsonpaths after v1, v2 etc.
    app.testInFolder('templates3', inputJPath, MustacheHandler, isVersioned, paths);
});

describe('Recursively test with files in templates4 folder', function () {
    let isVersioned = false; //out does not have params like v1, v2 ...
    let paths = ['_file']; //jsonpaths after out
    app.testInFolder('templates4', inputJPath, MustacheHandler, isVersioned, paths);
});

describe('test all tests in a yaml file', function () {
    let isVersioned = false; //out does not have params like v1, v2 ...
    let paths = ['expected']; //jsonpaths after out
    app.testInFile('templates5/tests.yml', "tests", MustacheHandler, isVersioned, paths);
});
