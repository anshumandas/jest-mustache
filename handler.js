const MustacheHelper = require('my-mustache-wax');

function handle(inModel, fullSpec, version) {
  let inputs = inModel.value;
  inputs['toUpper'] = version > 1;
  MustacheHelper.addFunctions(inputs);
  return inputs;
}

exports.handle = handle;
exports.customizer = function (objValue, srcValue) {
  if (_.isArray(objValue)) {
    let ret = _.union(objValue, srcValue);
    return ret;
  }
}
