const Chalk = require('chalk');
const app = require('./generator');
const YAML = require('js-yaml');
const FS = require('fs-extra');
const Path = require('path');
const _ = require('lodash');
const JPath = require('jsonpath');
require('jest-similar');

function resolveExcludes(input, dir) {
  if(_.has(input, '_exclude')) {
    for (var path of input._exclude) {
      let p = _.split(path, '#', 2);
      let filePath = Path.join(dir, p[0]);
      if (FS.existsSync(filePath)) {
        const yaml = YAML.safeLoad(FS.readFileSync(filePath, 'utf8'));
        let y = yaml;
        let pp = [];
        if(p[1] != null) {
          let q = _.split(p[1], '/');
          for (var i = 1; i < q.length; i++) {
            if(i > 2) pp.push(q[i]);
            y = y[q[i]];
            if(y == undefined) break;
          }
          if(y) {
            let pt = _.join(pp,'.');
            _.unset(input, pt);
          }
        }
      }
    }
  }
  return input;
}

function resolveIncludesExcludes(input, dir, handler) {
  let out = input;
  if(_.has(input, '_include')) {
    let incs = input._include;
    _.unset(input, '_include');
    for (var path of incs) {
      let p = _.split(path, '#', 2);
      let filePath = Path.join(dir, p[0]);
      // console.log(`${Chalk.green(JSON.stringify(filePath))}`);
      if (FS.existsSync(filePath)) {
        const yaml = YAML.safeLoad(FS.readFileSync(filePath, 'utf8'));
        let inc = yaml;
        if(p[1] != null) {
          let q = _.split(p[1], '/');
          for (var i = 1; i < q.length; i++) {
            inc = inc[q[i]];
          }
        }
        out = _.mergeWith(inc, out, handler.customizer);
      }
    }
  }
  //recurse for include within include
  if(out._include) {
    out = resolveIncludesExcludes(out, dir, handler);
  }
  out = resolveExcludes(out, dir); //exclude should not have another exclude
  // console.log(`${Chalk.yellow(JSON.stringify(out))}`);
  return out;
}

function getInput(input) {
  //TODO check if input is file and parse the file and return yaml content
  return input;
}

function testError(inPath, dir, file, yaml, ver, handler) {
  test(yaml.description, async () => {
    // console.log(`Testing ${Chalk.blue(yaml.description)}`);
    try{
      //TODO check if yaml has template and use that instead of scanning via generateAll
      const ret = await app.generateAll(null, Path.join(dir, file), getInput(yaml.in), inPath, ver, handler);
      const transformed = ret.paths;
      console.log(`No Exception ${Chalk.blue(transformed)}`);
      // let stack = new Error().stack
      // console.log( stack )
    } catch(ex) {
      try{
        expect(ex.message).toEqual(yaml.error);
      } catch(e2) {
        console.log(`Exception ${Chalk.red(ex.stack)}`);
        throw e2;
      }
    }
  });
}

async function check(inPath, expc, file, yaml, ver, dir, testFile, handler, paths) {
  if(_.has(expc, 'error')) {
    testError(inPath, dir, file, yaml, ver, handler);
  } else {
    let out = resolveIncludesExcludes(expc, Path.dirname(testFile), handler);
    let transformed;
    var fpath = Path.join('generated', dir);
    fpath = ver ? Path.join(fpath, 'v'+ver) : fpath;
    try {
      transformed = await app.generateAll(fpath, Path.join(dir, file), yaml.in, inPath, ver || 1, handler, true);
    } catch(ex) {
      if(!ex.issues) {
        console.error(ex.stack);
      }
      expect({'message':ex.message, 'issues': ex.issues}).toEqual({"error": false});
    }
    let tested = false;
    if(paths.length > 0) {
      for (var path of paths) {
        let expectNodes = JPath.nodes(out, path);
        if(expectNodes.length == 0 && JPath.nodes(transformed, path).length == 0) {
          tested = true;
        }
        for(var node of expectNodes) {
          if(path == "_file") {
            for (var f of node.value) {
              expect(FS.existsSync(f)).toBe(true);
              let out = Path.join(fpath, app.processFileName(file.substring(0, file.length - 9), yaml.in));
              expect(FS.existsSync(out)).toBe(true);
              let a = FS.readFileSync(f, 'utf8');
              let b = FS.readFileSync(out, 'utf8');
              expect(_.trim(a)).toEqual(_.trim(b));
              tested = true;
            }
          } else {
            tested = checkYaml(transformed, out, path, tested, node, yaml.description);
          }
        }
      }
    } else {
      expect(transformed).toBeSimilar(out);
      tested = true;
    }
    if(!tested) expect("No output paths").toBe("To get an output path");
  }
}

function checkYaml(transformed, out, path, tested, node, description) {
  // console.log(`${Chalk.blue(description)}`);
  let pathTested = false;
  let testPath = _.join(node.path, '.');
  let received = null;
  if(testPath.includes('/')) {
    let spl = _.split(testPath, './');
    received = JPath.nodes(transformed, spl[0])[0];
    if(received) {
      received = received.value;
      for (var i = 1; i < spl.length; i++) {
        received = received['/'+spl[i]];
      }
    } else {
      console.log(transformed);
      console.log(spl[0]);
    }
  } else {
    received = JPath.nodes(transformed, testPath)[0];
    if(received) received = received.value;
  }
  if(!received) {
    received = null;
  }
  try{
    expect(received).toBeSimilar(node.value);
  } catch(ex) {
    ex.message = `Test path ${Chalk.green(JSON.stringify(testPath))} of
    ${Chalk.yellow(JSON.stringify(_.keys(transformed.paths)))}
    ${ex.message}`;
    // console.log(`${Chalk.blue(JSON.stringify(node.value))}`);
    throw ex;
  }
  tested = true;
  pathTested = true;
  if(!pathTested) expect("No output in path " + path).toBe(node.value);
  return tested;
}

function callTests(inPath, expc, file, yaml, ver, dir, testFile, handler, paths) {
  var desc = Path.basename(testFile, '.yaml') + " : " + yaml.description;
  desc = ver ? desc + " : version - " + ver : desc;
  test(desc, async () => {
    await check(inPath, expc, file, yaml, ver, dir, testFile, handler, paths);
  });
  var spl = _.split(file, '.');
  if(spl.length == 3) {
    test("check file generation", () => {
      var fpath = Path.join('generated', dir);
      fpath = ver ? Path.join(fpath, 'v'+ver) : fpath;
      expect(FS.existsSync(Path.join(fpath, app.processFileName(file.substring(0, file.length - 9), yaml.in)))).toBe(true);
    });
  }
}

function doTests(dir, inPath, testFile, handler, isVersioned, paths) {
  const yaml = YAML.safeLoad(FS.readFileSync(testFile, 'utf8'));
  FS
   .readdirSync(dir)
   .filter(file => (FS.statSync(Path.join(dir, file)).isFile()) && file.endsWith('.mustache'))
   .forEach((file) => {
     //testing only paths at present. This would need to be extended to the other parts that change
     if(_.has(yaml, 'error')) {
       testError(inPath, dir, file, yaml, 1, handler);
     } else if(isVersioned){
       const versions = yaml.out;
       for (var version in versions) {
         if (version.startsWith("v") && versions.hasOwnProperty(version)) {
           const ver = version.substring(1);
           const expc = versions[version];
           callTests(inPath, expc, file, yaml, ver, dir, testFile, handler, paths);
         }
       }
     } else {
       callTests(inPath, yaml.out, file, yaml, null, dir, testFile, handler, paths);
     }
   })
}

function findTests(dir, inPath, testDir, handler, isVersioned, paths) {
  const ext = '.yaml';

  describe('Test suite ' + testDir, function () {
    FS
     .readdirSync(testDir)
     .forEach((file) => {
        if (FS.statSync(Path.join(testDir, file)).isFile() && file.endsWith(ext)) {
          doTests(dir, inPath, Path.join(testDir, file), handler, isVersioned, paths);
        } else if (FS.statSync(Path.join(testDir, file)).isDirectory()) {
          findTests(dir, inPath, Path.join(testDir, file), handler, isVersioned, paths);
        }
     });
  });
}

function recurseTest(dir, inPath, handler, isVersioned, paths) {
  const testDir = Path.join(dir, 'tests');
  if (FS.existsSync(testDir)) {
    findTests(dir, inPath, testDir, handler, isVersioned, paths)
   } else {
     FS
      .readdirSync(dir)
      .filter(file => (FS.statSync(Path.join(dir, file)).isDirectory() && file !== 'partials' ))
      .forEach((file) => {
        const path = Path.join(dir, file);
        recurseTest(path, inPath, handler, isVersioned, paths);
      });
   }
}

exports.testInFolder = function(dir, inPath, handler, isVersioned, paths, partialsPath) {
  app.templatePath = partialsPath || dir;
  recurseTest(dir, inPath, handler, isVersioned, paths);
}

exports.testInFile = function(dir, inPath, handler, isVersioned, paths, partialsPath) {
  app.templatePath = partialsPath || dir;
  //TODO add test a yaml file with multiple tests such as those in https://github.com/mustache/spec
}
