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

function applyMustache(file, inputModel, fullSpec, version, handler){
  // console.log(`Applying ${Chalk.blue(file)} Mustache`);
  //inputModel must be  single schema
  let inputs = handler.handle(inputModel, fullSpec, version);
  let partials = getPartials(Path.dirname(file));
  // console.log(`Partials ${Chalk.blue(JSON.stringify(_.keys(partials)))}`);
  let template = FS.readFileSync(file, 'utf8');
  let node = Mustache.render(template, inputs, partials);
  let yml = {};
  try {
    yml = YAML.safeLoad(node);
  } catch(ex) {
    console.log(node);
  }
  return yml;
}

function transform(file, node, spec, version, handler){
  let model = {};
  if(node != null) {
    // console.log(`Tranform
    //   ${Chalk.blue(JSON.stringify(spec))}
    //   Node: ${Chalk.yellow(JSON.stringify(node))}
    //   `);
    model = applyMustache(file, node, spec, version, handler);
  } else {
    var schema = {'value': spec};
    model = applyMustache(file, schema, spec, version, handler);
  }

  // console.log(`Model
  //   ${Chalk.blue(JSON.stringify(model))}`);

  spec = _.merge(spec, model);
}

function transformAll(file, spec, pathExpression, version, handler){
  // console.log(`Transforming ${Chalk.blue(JSON.stringify(spec))}`);
  if(pathExpression != null) {
    for(var node of JPath.nodes(spec, pathExpression)) {
      transform(file, node, spec, version, handler);
    };
  } else {
    transform(file, null, spec, version, handler);
  }
  return spec;
}

exports.transformAll = transformAll;
exports.transform = transform;
