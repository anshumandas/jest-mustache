'use strict';

const Fs = require('fs-extra');
const Path = require('path');
const _ = require('lodash');
const Yaml = require('js-yaml');
const Chalk = require('chalk');
const Mustache = require('mustache');
const JPath = require('jsonpath');

function addPartials(dir, to) {
  if (Fs.existsSync(dir)) {
    Fs
     .readdirSync(dir)
     .forEach((file) => {
       if(Fs.statSync(Path.join(dir, file)).isFile()) {
         to[Path.basename(file, '.mustache')] = Fs.readFileSync(Path.join(dir, file), 'utf8');
       } else {
         addPartials(Path.join(dir, file), to);
       }
     });
   }
   return to;
}

exports.templatePath = "templates/";

function getPartials(dir, defPartials) {
  // console.log(`Get Partials in ${Chalk.blue(dir)}`);
  let partials = defPartials || {};
  let partials_dir = Path.join(dir, 'partials');
  addPartials(partials_dir, partials);
  //check parent folder also
  if(dir.includes(exports.templatePath)) {
    getPartials(Path.join(dir, '..'), partials);
  } else {
    // console.log(`${Chalk.blue(exports.templatePath)} ${Chalk.red(dir)}`);
  }
  return partials;
}

async function applyHandler(inputModel, fullSpec, version, handler) {
  inputModel = inputModel || {'value': fullSpec};

  // console.log(`Tranform
  //   ${Chalk.blue(JSON.stringify(fullSpec))}
  //   Node: ${Chalk.yellow(JSON.stringify(inputModel))}
  //   `);
  // console.log(`Applying ${Chalk.blue(file)} Mustache`);
  //inputModel must be  single schema
  return handler.handle ? await handler.handle(inputModel, fullSpec, version) : fullSpec;
}

function applyMustache(file, inputs) {
  let partials = getPartials(Path.dirname(file));
  // console.log(`Partials ${Chalk.blue(JSON.stringify(_.keys(partials)))}`);
  let template = Fs.readFileSync(file, 'utf8');
  let node = Mustache.render(template, inputs, partials);
  return node;
}

function writeAndLog(filepath, filename, contents) {
  //split file path and mkdirs if not existing
  Fs.mkdirpSync(filepath, { recursive: true }, (err) => {
    if (err) throw err;
  });

  var fpath = Path.join(filepath, filename);
  Fs.writeFileSync(fpath, contents);
  // console.log(`Created ${Chalk.blue(fpath)}`);
}

function processFileName(filename, inputs) {
  _.templateSettings.interpolate = /__([\s\S]+?)__/g;
  var compiled = _.template(filename);
  // console.log(`Inputs ${Chalk.blue(JSON.stringify(inputs.name))}`);
  var c = compiled(inputs);
  // console.log(`Compiled ${Chalk.yellow(c)}`);
  return c;
}

function transform(filepath, file, spec, ins){
  let yml = {};
  _.merge(yml, spec);
  for (var i = 0; i < ins.length; i++) {
    let inp = ins[i].value || {};
    let content = generate(filepath, file, inp);
    var spl = _.split(file, '.');
    if(spl.length != 3 || 'yaml' == spl[1]) {
      let c = Yaml.safeLoad(content);
      _.merge(yml, c);
    } else {
      yml = content;
    }
  }
  return yml;
}

function generate(filepath, file, inputs){
  let contents = {};
  if(file.endsWith('.mustache')) {
    contents = applyMustache(file, inputs);
    if(filepath) {
      //remove the musache extension
      let filename = file.substring(file.lastIndexOf('/')+1, file.length - 9);
      filename = processFileName(filename, inputs);
      // console.log(`Filename ${Chalk.yellow(filename)}`);
      writeAndLog(filepath, filename, contents);
    }
  }
  return contents;
}

async function generateAll(filepath, file, spec, pathExpression, version, handler, mergeWithSpec){
  let ins = [];
  if(handler.pre) handler.pre(spec);
  if(handler.handle) {
    if(pathExpression != null) {
      for(var node of JPath.nodes(spec, pathExpression)) {
        let model = {name: _.last(node.path), value: node.value};

        let inputs = await applyHandler(model, spec, version, handler);
        if(filepath && file.includes('__')) {
          generate(filepath, file, inputs);
        }
        ins.push({ name:_.last(node.path), value: inputs});
      };
    } else {
      let inputs = await applyHandler({value: spec}, spec, version, handler);
      ins.push({value:inputs});
    }
  }

  let ret = spec;
  if(mergeWithSpec) {
    ret = transform(filepath, file, spec, ins);
  } else if(!file.includes('__')) {
    generate(filepath, file, handler.post ? handler.post(spec, ins) : ins[0].value);
  }

  return ret;
}

exports.generateAll = generateAll;
exports.generate = generate;
exports.writeAndLog = writeAndLog;
exports.processFileName = processFileName;
