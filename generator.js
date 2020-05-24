'use strict';

const FS = require('fs-extra');
const Path = require('path');
const _ = require('lodash');
const YAML = require('js-yaml');
const Chalk = require('chalk');
const Mustache = require('mustache');
const JPath = require('jsonpath');

function addPartials(dir, to) {
  if (FS.existsSync(dir)) {
    FS
     .readdirSync(dir)
     .forEach((file) => {
       if(FS.statSync(Path.join(dir, file)).isFile()) {
         to[Path.basename(file, '.mustache')] = FS.readFileSync(Path.join(dir, file), 'utf8');
       } else {
         addPartials(Path.join(dir, file), to);
       }
     });
   }
   return to;
}

exports.templatePath = "templates/";

function getPartials(dir, defPartials){
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

async function applyMustache(file, inputModel, fullSpec, version, handler){

  inputModel = inputModel || {'value': fullSpec};

  // console.log(`Tranform
  //   ${Chalk.blue(JSON.stringify(fullSpec))}
  //   Node: ${Chalk.yellow(JSON.stringify(inputModel))}
  //   `);
  // console.log(`Applying ${Chalk.blue(file)} Mustache`);
  //inputModel must be  single schema
  let inputs = await handler.handle(inputModel, fullSpec, version);
  let partials = getPartials(Path.dirname(file));
  // console.log(`Partials ${Chalk.blue(JSON.stringify(_.keys(partials)))}`);
  let template = FS.readFileSync(file, 'utf8');
  let node = Mustache.render(template, inputs, partials);
  return node;
}

async function transform(file, node, spec, version, handler){
  let contents = await applyMustache(file, node, spec, version, handler);

  if(_.endsWith(file, '.json.mustache') || (_.endsWith(file, '.mustache') && _.split(file, '.').length == 2)) {
    let yml = {};
    try {
      yml = YAML.safeLoad(contents || {});
    } catch(ex) {
      console.log(node);
      console.error(ex.stack);
    }

    // console.log(`Model
    //   ${Chalk.blue(JSON.stringify(yml))}`);

    spec = _.merge(spec, yml);
  }
}

async function transformAll(file, spec, pathExpression, version, handler){
  // console.log(`Transforming ${Chalk.blue(JSON.stringify(spec))}`);
  if(pathExpression != null) {
    for(var node of JPath.nodes(spec, pathExpression)) {
      await transform(file, node, spec, version, handler);
    };
  } else {
    await transform(file, null, spec, version, handler);
  }
  return spec;
}

function writeAndLog(filepath, filename, contents) {
  //split file path and mkdirs if not existing
  FS.mkdirpSync(filepath, { recursive: true }, (err) => {
    if (err) throw err;
  });

  var fpath = Path.join(filepath, filename);
  FS.writeFileSync(fpath, contents);
  // console.log(`Created ${Chalk.blue(fpath)}`);
}

function processFileName(filename, spec) {
  _.templateSettings.interpolate = /__([\s\S]+?)__/g;
  var compiled = _.template(filename);
  return compiled(spec);
}

async function generate(filepath, file, node, spec, version, handler){
  if(file.endsWith('.mustache')) {
    //remove the musache extension
    let filename = file.substring(file.lastIndexOf('/')+1, file.length - 9);
    filename = processFileName(filename, spec);
    let contents = await applyMustache(file, node, spec, version, handler);
    writeAndLog(filepath, filename, contents);
  }
}

async function generateAll(filepath, file, spec, pathExpression, version, handler){
  // console.log(`Transforming ${Chalk.blue(JSON.stringify(spec))}`);
  if(pathExpression != null) {
    for(var node of JPath.nodes(spec, pathExpression)) {
      await generate(filepath, file, node, spec, version, handler);
    };
  } else {
    await generate(filepath, file, null, spec, version, handler);
  }
}

exports.transformAll = transformAll;
exports.transform = transform;
exports.generateAll = generateAll;
exports.generate = generate;
exports.writeAndLog = writeAndLog;
exports.processFileName = processFileName;
