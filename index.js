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

function customizer(objValue, srcValue) {
  if (_.isArray(objValue)) {
    let ret = _.sortBy(_.unionBy(objValue, srcValue, 'name'), ['name']);
    return ret;
  }
}

function resolveIncludesExcludes(input, dir) {
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
        out = _.mergeWith(inc, out, customizer);
      }
    }
  }
  //recurse for include within include
  if(out._include) {
    out = resolveIncludesExcludes(out, dir);
  }
  out = resolveExcludes(out, dir); //exclude should not have another exclude
  // console.log(`${Chalk.yellow(JSON.stringify(out))}`);
  return out;
}

function testError(inPath, dir, file, yaml, ver, handler) {
  test(yaml.description, () => {
    // console.log(`Testing ${Chalk.blue(yaml.description)}`);
    try{
      const transformed = generate(dir, file, yaml.in, inPath, ver, handler).paths;
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

function generate(dir, file, spec, inPath, version, handler) {
  //remove the musache extension
  let filename = file.substring(0, file.length - 9);
  return app.transformAll(Path.join(dir, file), spec, inPath, version, handler);
}

function check(inPath, expc, file, yaml, ver, dir, testFile, handler, paths) {
  // console.log(`Testing ${Chalk.blue(yaml.description + " : version - " + ver)}`);
  if(_.has(expc, 'error')) {
    testError(inPath, dir, file, yaml, ver, handler);
  } else {
    let out = resolveIncludesExcludes(expc, Path.dirname(testFile));
    let transformed;
    try {
      transformed = generate(dir, file, yaml.in, inPath, ver, handler);
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
          let pathTested = false;
          let testPath = _.join(node.path, '.');
          let received = null;
          if(testPath.includes('/')) {
            let spl = _.split(testPath, './');
            received = JPath.nodes(transformed, spl[0])[0].value;
            for (var i = 1; i < spl.length; i++) {
              received = received['/'+spl[i]];
            }
          } else {
            received = JPath.nodes(transformed, testPath)[0].value;
          }
          if(!received) {
            received = null;
          }
          try{
            expect(received).toBeSimilar(node.value);
          } catch(ex) {
            console.log(`${Chalk.yellow(JSON.stringify(received))}`);
            console.log(`${Chalk.blue(JSON.stringify(node.value))}`);
            throw ex;
          }
          tested = true;
          pathTested = true;
          if(!pathTested) expect("No output in path "+path).toBe(node.value);
        }
      }
    } else {
      expect(transformed).toBeSimilar(out);
      tested = true;
    }
    if(!tested) expect("No output paths").toBe("To get an output path");
  }
}

function doTest(dir, inPath, testFile, handler, isVersioned, paths) {
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
           test(Path.basename(testFile, '.yaml') + " : " + yaml.description + " : version - " + ver, () => {
             check(inPath, expc, file, yaml, ver, dir, testFile, handler, paths);
           });
         }
       }
     } else {
       test(Path.basename(testFile, '.yaml') + " : " + yaml.description, () => {
         check(inPath, yaml.out, file, yaml, 1, dir, testFile, handler, paths);
       });
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
          doTest(dir, inPath, Path.join(testDir, file), handler, isVersioned, paths);
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
