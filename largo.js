'use strict';

// TODO: Scope variables must be prime on global variables
//       When script calls for a variable, check first if it exists on the scope, next on global variables, then on native vars

var REGS = {};

String.prototype.matchr = function(regex, notEnd) {
  regex = regex.toString().substr(1);
  regex = regex.substr(0, regex.length - 1);
  regex = new RegExp('^' + regex.replace(/\{([a-zA-Z0-9_]+)\}/g, function(match, name) {
    return REGS.hasOwnProperty(name) ? REGS[name] : match;
  }) + (notEnd ? '' : '$'), '');

  return this.match(regex);
}

var Largo = function() {

  this.types   = ['bool', 'number', 'string', 'void'];
  this.version = '0.2.0';
  this.prefix  = 'alpha';

  function _toJsValue(value) {
    var tmp;

    if(typeof value !== 'string')
      return value;

    if(value.substr(0, 1) === value.substr(value.length - 1, 1) && (value.substr(0, 1) === '"' || value.substr(0, 1) === "'"))
      return value.substr(1, value.length - 2);

    if(!Number.isNaN(tmp = parseInt(value)))
      return tmp;

    return value;
  }
  function _clone(e){var n;if(null==e||"object"!=typeof e)return e;if(e instanceof Date)return n=new Date,n.setTime(e.getTime()),n;if(e instanceof Array){n=[];for(var t=0,r=e.length;r>t;t++)n[t]=_clone(e[t]);return n}if(e instanceof Object){n={};for(var o in e)e.hasOwnProperty(o)&&(n[o]=_clone(e[o]));return n}throw new Error("Unable to copy object ! Its type isn't supported.")}
  function _formatContent(content, js, stack, deletedScoped, deletedVariables, native_vars, variables, scope) {
    var match;

    if(js) {
      if(typeof content === 'undefined' || content === null) { return {type: 'void'}; }
      if(typeof content === 'boolean') { return {type: 'bool'}; }
      if(typeof content === 'string') { return {type: 'string'}; }
      if(typeof content === 'number') { return {type: 'number'}; }
      //if(typeof content === 'object' && Array.isArray(content)) { return {type: 'array', value: content}; }
      return {msg: 'Syntax error'};
    }

    if(content.substr(0, 7) === '$stack:' && !Number.isNaN(match = parseInt(content.substr(7)))) {
      if(typeof stack[match] === 'undefined')
        return {msg: 'Stack\'s range ' + match + ' is not defined'};

      return stack[match];
    }

    if(!Number.isNaN(match = parseInt(content)))
      return {type: 'number', value: match};

    if(deletedScoped.indexOf(content) !== -1)
      return {msg: '"' + content + '" variable was deleted (scope)'};
    if(deletedVariables.indexOf(content) !== -1)
      return {msg: '"' + content + '" variable was deleted (global)'};

    if(native_vars.hasOwnProperty(content))
      return native_vars[content];

    if(variables.hasOwnProperty(content))
      return variables[content];

    if(scope.hasOwnProperty(content))
      return scope[content];

    if(match = content.match(/^"([^"]*)"$/) || (match = content.match(/^'([^']*)'$/)))
      return {type: 'string', value: match[1].replace(/\${([a-zA-Z0-9_]+)}/g, function(match, name) {
        var a = native_vars[name] || variables[name] || scope[name];

        if(a && !({})[name])
          return a.value;

        return '{{ ERROR: Undefined variable "' + name + '" }}';
      })};

    // Unrecognized content
    if(match = content.matchr(/([a-zA-Z0-9_]+)/))
      return {msg: 'Variable "' + match[0] + '" not found'};

    return {msg: 'Syntax error'};
  }

  /**
    * Run a Largo code
    * @param {string} code
    */
  this.run = function(code, options) {
    var time = {opt: false}, err;

    options = options || {};
    options.autoStart = true;

    try { var res = new this.Script(code, options); }
    catch(e) { return e.stack; }

    if(res.fatal) { res.fatal.failed = true;  return res.fatal; };
    if(err = res.get('error')) { err.failed = true; return err; }
    return res.get('benchmark');

    /*return {
      speed: {
        script: Date.now() - started,
        astBuild: time.build,
        astOptimize: time.opt,
        astRun: Date.now() - started - time.build - time.opt,
        realAstRun: res.duration
      }
    };*/
  };

  /**
    * Make an abstract syntax tree from Largo code
    * @param {string} code
    * @return {object} AST
    */
  this.build_ast = function(code) {
    function formatContent(content, js) {
      return _formatContent(content, js, stack, deletedScoped, deletedVariables, native_vars, variables, scope[scope.length - 1]);
    }

    /**
      * Format arguments in module's declaration
      * @param {string} args
      * @return {object}
      */
    function formatArgs(args) {
      var fargs = [], v, name;
      args = args.split(',');

      for(j = 0; j < args.length; j++) {
        v = Largo.formatVar(args[j].trim(), true);

        if(v)
          fargs.push(v);
      }

      return fargs;
    }

    /**
      * Format arguments in module's call
      * @param {string} lne
      * @return {object}
      */
    function formatCallArgs(lne) {
      var args = [], quoteOpened = null, parenthesisOpened = 0, bracketsOpened = 0, content = '', char, match, _args;

      for(var j = 0; j < lne.length; j++) {
        char = lne[j];

        if(char === ',' && !bracketsOpened && !quoteOpened && !parenthesisOpened) {
          if(!content.length)
            return error('Empty argument found');

          if(match = content.match(/^([a-zA-Z0-9_]+) *\((.*)\)$/)) {
            _args = formatCallArgs(match[2]);
            if(!Array.isArray(_args)) { return error('Bad arguments passed to module "' + match[1] + '" (inline call)'); }
            stackIndex++;
            if(stackIndex > 1000) console.log('WARN: Stack exceed 1000 entries !');
            ast.push({action: 'call-module', name: match[1], args: _args, store: '$stack:' + stackIndex});
            args.push('$stack:' + stackIndex);
          } else
            args.push(content);

          content = '';
          continue ;
        }

        if(char === ' ' && !quoteOpened)
          continue ;

        if(char === '"' || char === "'") {
          if(!quoteOpened)
            quoteOpened = char;
          else if(quoteOpened === char)
            quoteOpened = null;
        }

        if(char === '[' && !quoteOpened)
          bracketsOpened += 1;

        if(char === ']' && !quoteOpened) {
          if(!bracketsOpened)
            return error('Can\'t close bracket : No brackets opened');

          bracketsOpened -= 1;
        }

        if(char === '(' && !quoteOpened)
          parenthesisOpened += 1;

        if(char === ')' && !quoteOpened) {
          if(!parenthesisOpened)
            return error('Can\'t close parenthesis : No parenthesis opened');

          parenthesisOpened -= 1;
        }

        content += char;
      }

      if(args.length || content.length) {
        if(!content.length)
          return error('Empty argument found');

        if(match = content.match(/^([a-zA-Z0-9_]+) *\((.*)\)$/)) {
          _args = formatCallArgs(match[2]);
          if(!Array.isArray(_args)) { return error('Bad arguments passed to module "' + match[1] + '" (inline call)'); }
          stackIndex++;
          if(stackIndex > 1000) console.log('WARN: Stack exceed 1000 entries !');
          ast.push({action: 'call-module', name: match[1], args: _args, store: '$stack:' + stackIndex});
          args.push('$stack:' + stackIndex);
        } else
          args.push(content);
      }

      return args;
    }

    function error(msg) {
      return {failed: true, message: msg, line: optimizing ? al + 1 : i + 1, astLine: optimizing ? it : line};
    }

    var lines = code.split(/\r\n|\r|\n/), line, match, ast = [], j, indent, moduleNotClosed, args, i = -1, stackIndex = -1;
    var optimizing = false;

    while(true) {
      i++;

      if(i >= lines.length)
        break;

      // Get line's indentation
      indent = lines[i].replace(/\t/g, '  ').match(/^  +/); indent = indent ? indent[0].length : indent;
      // ... and clean it
      line   = lines[i].trim().replace(/;+$/, '');

      if(lines[i] === '###') {
        i++;

        while(lines[i] !== '###') {
          i++;

          if(i >= lines.length - 1)
            return error('Commentary block not closed');
        }

        continue ;
      }

      if(line.substr(0, 1) === '#')
        continue ;

      // If the line is not indented and a module hasn't been closed
      if(!indent && moduleNotClosed) {
        // So this line close it
        ast.push({action: 'close-module'});
        moduleNotClosed = false;
      }

      if(!line)
        continue ;

      // ex: delete myNumber
      if(match = line.matchr(/delete{s}{var}/)) {
        // Delete a variable (to free memory)
        ast.push({action: 'delete-variable', name: match[1]});

      // ex: int myNumber
      } else if(match = line.matchr(/{dclr_type}{s}{var}/)) {
        // Declare a variable
        if(!match[1]) // non-constant
          ast.push({action: 'declare-variable', name: match[3], type: match[2]});
        else // constant
          ast.push({action: 'declare-variable', name: match[3], type: match[2], constant: true});

      // ex: module helloWorld(string name, int age) : void
      } else if(match = line.matchr(/module{s}{anumu}{s_}(?:\(| ){arguments}(?:\)| ){s_}:{s_}{type}/)) {
        // Declare a module
        if(moduleNotClosed)
          // A module is already in declaration
          return error('Can\'t declare a module into another');
        else if(indent)
          // Line is indented
          return error('Modules must be declared with no indentation');

        // Format arguments as an array
        args = formatArgs(match[2]);
        // An error was declared by formatArgs() function, so we have to return it
        if(!Array.isArray(args)) { return args; }

        ast.push({action: 'declare-module', name: match[1], type: match[3], args: args});
        moduleNotClosed = true;

      // ex: test = sqrt(9)
      } else if(match = line.matchr(/{var}{s_}(\+|\-|\*|\/|)={s_}{anumu}{s_}\({call_arguments}\)/)) {
        // Assign value to a variable using a module
        args = formatCallArgs(match[4]);
        if(!Array.isArray(args)) { return args; }

        ast.push({action: 'call-module', name: match[3], args: args, store: match[1], operation: match[2]});

      // ex: int myNumber = sqrt(9)
      } else if(match = line.matchr(/{dclr_type}{s}{var}{s_}={s_}{anumu}{s_}\({call_arguments}\)/)) {
        args = formatCallArgs(match[5]);
        if(!Array.isArray(args)) { return args; }

        if(!match[1])
          ast.push({action: 'declare-variable', name: match[3], type: match[2]});
        else
          ast.push({action: 'declare-variable', name: match[3], type: match[2], constant: true});

        ast.push({action: 'call-module', name: match[4], args: args, store: match[3]});

      // ex: int myNumber = sqrt 9
      } else if(match = line.matchr(/{dclr_type}{s}{var}{s_}={s_}{anumu}{s}{call_arguments}/)) {
        args = formatCallArgs(match[5]);
        if(!Array.isArray(args)) { return args; }

        if(!match[1]) //non-constant
          ast.push({action: 'declare-variable', name: match[3], type: match[2]});
        else
          ast.push({action: 'declare-variable', name: match[3], type: match[2], constant: true});

        ast.push({action: 'call-module', name: match[4], args: args, store: match[3]});

      // ex: int myNumber = 32
      } else if(match = line.matchr(/{dclr_type}{s}{var}{s_}={s_}(.*)/)) {
        if(!match[1]) //non-constant
          ast.push({action: 'declare-variable', name: match[3], type: match[2]});
        else
          ast.push({action: 'declare-variable', name: match[3], type: match[2], constant: true});

        ast.push({action: 'var-assign-value', name: match[3], operation: false, value: match[4]});

      // ex: test = 32
      } else if(match = line.matchr(/{var}{s_}(\+|\-|\*|\/|)={s_}(.*)/)) {
        // Assign value to a variable
        ast.push({action: 'var-assign-value', name: match[1], operation: match[2] || false, value: match[3]});

      // ex: return add(2, 4)
      } else if(match = line.matchr(/return{s}{anumu}\({call_arguments}\)/)) {
        // Return a value by using a module
        args = formatCallArgs(match[2]);
        /*console.log(match[2]);
        console.log(args);*/
        if(!Array.isArray(args)) { return args; }
        stackIndex += 1;
        ast.push({action: 'call-module', name: match[1], args: args, store: '$stack:' + stackIndex});
        ast.push({action: 'return', value: '$stack:' + stackIndex});

      // ex: return 64
      } else if(match = line.matchr(/return{s}(.*)/)) {
        // Return a value
        ast.push({action: 'return', value: match[1]});

      // ex: helloWorld("Betty", 20)
      } else if(match = line.matchr(/{anumu}{s_}\({call_arguments}\)/)) {
        // Call a module
        args = formatCallArgs(match[2]);
        if(!Array.isArray(args)) { return args; }

        ast.push({action: 'call-module', name: match[1], args: args});

      // ex: helloWorld "Betty", 20
      } else if(match = line.matchr(/{anumu}{s}{call_arguments}/)) {
        // Call a module

        args = formatCallArgs(match[2]);
        if(!Array.isArray(args)) { return args; }

        ast.push({action: 'call-module', name: match[1], args: args});

      } else
        return error('Unknown instruction');
    }

    if(moduleNotClosed) {
      ast.push({action: 'return'});
      ast.push({action: 'close-module'});
    }

    ast.LARGO = 'AST';

    /* ========================================== */
    /* ========================================== */
    /* =============== Optimization ============= */
    /* ========================================== */
    /* ========================================== */

    var variables = {}, variables = {}, modules = {}, declaring = null, declaringContent = [], arg, args, namedArgs, j, modl, content, vars, vari;
    var returnValue, assignedConst = [], type, name, stack = [], it, declaringArgumentNames = [], dontRegister, scope = [{}]; // We put an empty scope to simplify a part of the JavaScript code
    var deletedVariables = [], deletedScoped = [];
    var native_vars = _clone(Largo.native_variables);

    function nextLine(that) {
      var tmp;
      al++;

      if(al >= ast.length)
        return ;

      it = ast[al]; dontRegister = false;

      switch(it.action) {
        case 'declare-module':
          if(modules.hasOwnProperty(it.name) || (tmp = Largo.native_modules.hasOwnProperty(it.name)))
            return error('Can\'t redeclare ' + (tmp ? 'native ' : '') + 'module "' + it.name + '"');

          if(({})[it.name])
            return error('Module "' + it.name + '" is a JavaScript-reserved name');

          declaring = it; tmp = {}; declaringArgumentNames = []; deletedScoped = [];

          for(var i = 0; i < it.args.length; i++) {
            arg = it.args[i];
            tmp[arg.name] = {type: arg.type};
            if(arg.constant) tmp[arg.name].constant = true;
            declaringArgumentNames.push(arg.name);
          }

          scope.push(tmp);
          dontRegister = true;
          break;

        case 'close-module':
          modules[declaring.name] = {args: declaring.args, type: declaring.type, content: declaringContent, scopeVars: scope[scope.length - 1]};
          declaringContent = [];
          //console.log(modules[declaring.name].scopeVars);
          declaring = null;

          scope.splice(scope.length - 1, 1);
          dontRegister = true;
          break;

        case 'declare-variable':
          if(native_vars.hasOwnProperty(it.name))
            return error('"' + it.name + '" variable is a native constant, can\'t be redeclared');

          if(({})[it.name])
            return error('"' + it.name + '" is a JavaScript-reserved name. Can\'t declare variable with this name.');

          if(variables.hasOwnProperty(it.name) || scope[scope.length - 1].hasOwnProperty(it.name))
            return error('"' + it.name + '" variable was already declared');

          if(declaring)
            scope[scope.length - 1][it.name] = it.constant ? {type: it.type, constant: true} : {type: it.type};
          else
            variables[it.name] = it.constant ? {type: it.type, constant: true} : {type: it.type};

          dontRegister = true;
          break;

        case 'delete-variable':
          if(native_vars.hasOwnProperty(it.name))
            return error('"' + it.name + '" is a native constant, can\'t delete it');

          if(deletedVariables.indexOf(it.name) !== -1 || deletedScoped.indexOf(it.name) !== -1)
            return error('"' + it.name + '" was already deleted');

          if(declaring && declaringArgumentNames.indexOf(it.name) !== -1)
            return error('"' + it.name + '" is a module argument, can\'t delete it');

          if(!variables.hasOwnProperty(it.name) && !scope[scope.length - 1].hasOwnProperty(it.name))
            return error('"' + it.name + '" variable was not found, can\'t delete it');

          if(that.is_constant(it.name))
            return error('"' + it.name + '" is a constant, can\'t delete it');

          if(variables.hasOwnProperty(it.name))
            deletedVariables.push(it.name);
          else
            deletedScoped.push(it.name);

          break;

        case 'call-module':
          modl = modules[it.name] || Largo.native_modules[it.name];

          if(!modl)
            return error('Module not found : "' + it.name + '"');

          if(({})[it.name])
            return error('Module "' + it.name + '" is a JavaScript-reserved name');

          args = []; namedArgs = {}

          if(it.args.length > modl.args.length && !(modl.js && modl.args[0] === '*'))
            return error('Too many arguments passed to module "' + it.name + '" : ' + modl.args.length + ' required, but ' + it.args.length + ' passed');

          for(j = 0; j < it.args.length; j++) {
            content = formatContent(it.args[j]);

            if(content.msg && !content._) { return error(content.msg); }

            /*if((content._ !== 'u_ref' && modl.args[j].type === 'u_ref') || (content._ === 'u_ref' && (content._ === modl.args[j].type || modl.args[j].type === 'u_mixed'))) {
              args.push(it.args[j]);
              continue ;
            }*/

            if(content._)
              return error(content.msg);

            args.push(content);

            if(!(modl.js && modl.args[0] === '*')) {
              if(content.type !== modl.args[j].type && modl.args[j].type !== 'mixed')
                return error('Argument type mismatch : Argument "' + modl.args[j].name + '" [' + (j + 1) + '] for module "' + it.name + '" must be typed `' + modl.args[j].type + '`, `' + content.type + '` passed');

              namedArgs[modl.args[j].name] = {type: content.type};
            }
          }

          if(it.args.length < modl.args.length) {
            for(j = it.args.length; j < modl.args.length; j++) {
              if(!modl.args[j].optionnal)
                return error('Arguments number mismatch : Module "' + it.name + '" requires ' + modl.args.length + ' arguments, but only ' + it.args.length + ' passed');

              args.push(undefined);
              namedArgs[modl.args[j].name] = {type: modl.args[j].type, value: undefined};
            }
          }

          if(it.store) {
            if(it.store.substr(0, 7) === '$stack:')
              stack[it.store.substr(7)] = {type: modl.type};
            else if(that.is_constant(it.store)) {
              // WARNING: if global var `name` is assigned const, local `name` var can't be assignated
              if(assignedConst.indexOf(it.store) !== -1)
                return error('"' + it.store + '" is a constant (read-only)');

              assignedConst.push(it.store);
            }
          }

          break;

        case 'var-assign-value':
          if(native_vars.hasOwnProperty(it.name))
            return error('"' + it.name + '" is a native constant (read-only)');

          if(deletedScoped.indexOf(it.name) !== -1)
            return error( '"' + it.name + '" variable was already deleted (scope)');
          if(deletedVariables.indexOf(it.name) !== -1)
            return error( '"' + it.name + '" variable was already deleted (global)');

          if(!variables.hasOwnProperty(it.name) && !scope[scope.length - 1].hasOwnProperty(it.name))
            return error('"' + it.name + '" variable was not found, can\'t assign value');

          if(that.is_constant(it.name)) {
            // gérer les constantes dans le scope (déclaration d'un module)
            // voir script.largo
            if((variables[it.name] && typeof variables[it.name].value !== 'undefined')
            || (scope[scope.length - 1][it.name] && typeof scope[scope.length - 1][it.name].value !== 'undefined'))
              return error('"' + it.name + '" is a constant (read-only)');

            assignedConst.push(it.name);
          }

          content = formatContent(it.value);
          if(content.msg) { return error('"' + content.msg + ' : ' + it.value); }
          vari = variables[it.name] || scope[scope.length - 1][it.name];

          // TODO: Consider operations (+ - * /) !!

          content.type = content.type || content._;

          if(content.type !== vari.type && vari.type !== 'mixed')
            return error('"' + it.name + '" variable is typed `' + vari.type + '`, trying to assign `' + content.type + '`-typed value');

          if(assignedConst.indexOf(it.name) !== -1)
            vari.value = content.value;

          dontRegister = (assignedConst.indexOf(it.name) !== -1);
          break;

        case 'return':
          if(!declaring)
            return error('`return` instruction can only be used in a module');

          returnValue = (typeof it.value !== 'undefined' ? formatContent(it.value) : {type: 'void'});
          if(returnValue.msg) { return error(returnValue.msg); }
          type = returnValue._ || returnValue;
          //name = native_vars["__module"].value;
          modl = declaring;

          // TODO: Check if u_* type is fully supported
          if((returnValue.type.substr(0, 1) !== 'u_' && returnValue.type !== modl.type && modl.type !== 'mixed' && modl.type !== 'u_mixed') || (returnValue.type.substr(0, 1) === 'u_' && returnValue.type !== modl.type && modl.type !== 'u_mixed'))
            return error('Module "' + modl.name +  '" must returns `' + modl.type + '`, `' + returnValue.type + '` returned');

          if(modl.type !== 'void' && declaring.store) {
            //name = returnVars.splice(returnVars.length - 1, 1)[0];
            name = declaring.store;

            if(deletedScoped.indexOf(name) !== -1)
              return error( '"' + name + '" variable was already deleted (scope)');
            if(deletedVariables.indexOf(name) !== -1)
              return error( '"' + name + '" variable was already deleted (global)');

            if(that.is_constant(name))
              return error('"' + name + '" is a constant, can\'t use it as a module store');

            if(name.substr(0, 7) === '$stack:')
              stack[name.substr(7)] = {type: modl.type};
            //else {} // it.store
          }

          break;

        default:
          return error('Unknown AST instruction : "' + it.action + '"');
          break;
      }

      if(declaring && !dontRegister)
        declaringContent.push(it);

      if(!declaring && !dontRegister)
        lines.push(it);

    }

    this.is_constant = function(name) {
      return ({})[name] || native_vars.hasOwnProperty(name) || (variables[name] && variables[name].constant) || (scope[scope.length - 1][name] && scope[scope.length - 1][name].constant);
    };

    /* ==== Build part ==== */

    var res, al = -1;
    optimizing = true; lines = [];

    while(true) {
      res = nextLine(this);
      if(res) { return res; }

      if(al >= ast.length)
        break;
    }

    // Build all optimized AST parts
    // And return it
    return {
      modules  : modules,
      variables: variables,
      lines    : lines,
      LARGO    : 'optimized-AST-' + Largo.version
    };
  };

  /**
    * Run a code or an abstract syntax tree
    * @param {object|string} input AST or code
    * @param {object} [options]
    * @return {string|number} If returns a string, that's an error message. Otherwise, it returns the real AST running duration, in miliseconds
    */
  this.Script = function(input, options) {
    function formatContent(content, js) {
      return _formatContent(content, js, stack, deletedScoped, deletedVariables, native_vars, variables, scope[scope.length - 1]);
    }

    options = options ? _clone(options) : {};

    /**
      * Display an error in the console
      * @param {string} msg
      * @return {boolean} false
      */
    function con_err(msg) {
      console.error('ERROR: ' + msg);
      return false;
    }

    var ast, astBuildingTime = null, astVer, lver;

    /* Build AST if a code has been passed */
    if(typeof input === 'string') {
      astBuildingTime = Date.now();
      ast = Largo.build_ast(input);
      //console.log(ast.modules.version.args);
      astBuildingTime = Date.now() - astBuildingTime;

      if(ast.failed) {
        this.fatal = {message: ast.message, astLine: ast.line, content: ast.astLine};
        return false;
      }
    } else if(typeof input === 'object' && !Array.isArray(input) && input.LARGO && input.LARGO.substr(0, 14) === 'optimized-AST-') {
      if(input.LARGO.substr(14) !== Largo.version) {
        astVer = input.LARGO.substr(14).split('.'); lver = Largo.version.split('.');

        if(astVer[0] > lver[0] || (astVer[0] === lver[0] && astVer[1] > lver[1]) || (astVer[0] === lver[0] && astVer[1] === lver[1] && astVer[2] > lver[2])) {
          if(options.allowHigherVersion)
            console.log('WARNING: AST version (' + input.LARGO.substr(14) + ') is higher than Largo version (' + Largo.version + ')');
          else
            throw new Error('AST version (' + input.LARGO.substr(14) + ') is higher than Largo version (' + Largo.version + ')');
        } else
          console.log('NOTICE: AST version (' + input.LARGO.substr(14) + ') is lower than Largo version (' + Largo.version + ')');
      }

      ast = input;
    } else
      throw new Error('Largo script input must be a code or an optimized AST');

    var lines     = ast.lines,
        modules   = ast.modules,
        variables = ast.variables,
        scope     = [{}], // We put an empty scope to simplify a part of the JavaScript code
        stack     = [],
        stores    = [],
        events    = {
          error   : {},
          finished: {}
        },
        countId   = 0,
        line      = -1,
        infos     = {
          state: {
            paused  : false,
            finished: false
          },
          benchmark: {
            durations  : [],  // execution time for each AST instruction
            duration   : 0 ,  // total execution time                        In miliseconds,
            astBuilding: astBuildingTime // AST buuilding duration (if a string is passed as input)
          }
        },
        errors           = [] /* All execution errors */,
        started          = false /* Is Largo running @start */,
        running          = false /* Is Largo running an instruction */,
        native_vars      = _clone(Largo.native_variables),
        deletedScoped    = [],
        deletedVariables = [],
        tmp;

      /**
      * Catch an event
      * @param {string} event Event name
      * @param {function} callback
      * @param {string} [id] Callback ID. If omitted, ID is auto-generated
      * @return {string|boolean} Callback ID, or false if there was an error
      */
    this.on = function(event, callback, id) {
      if(typeof callback !== 'undefined')
        return con_err('Event callback must be a function');

      if(!events.hasOwnProperty(event))
        return con_err('Event "' + event + '" is not supported');

      if(typeof id !== 'string')
        id = (countId++ + 1);

      if(events[event].hasOwnProperty(id))
        return con_err('Event "' + event + '" already contains a callback named "' + id + '"');

      events[event][id] = callback;
      return id;
    };

    /**
      * Uncatch an event
      * @param {string} event Event name
      * @param {string} id Callback ID
      * @return {boolean}
      */
    this.off = function(event, id) {
      if(!events.hasOwnProperty(event))
        return con_err('Event "' + event + '" is not supported');

      if(events[event].hasOwnProperty(id))
        return con_err('Event "' + event + '" already contains a callback named "' + id + '"');

      delete events[event][id];
      return true;
    };

    /**
      * Make an event
      * @param {string} event Event name
      * @param {*} trigger Event
      * @return {boolean}
      */
    this.trigger = function(event, trigger) {
      if(!events.hasOwnProperty(event))
        return con_err('Event "' + event + '" is not supported');

      for(var i = 0; i < events[event].length; i++)
        events[event].call(typeof global === 'undefined' ? window : global, trigger);

      return true;
    };

    /**
      * Run script's next instruction
      * @return {object|void} Can returns an error message
      */
    this.runStep = function() {
      function error(msg) {
        var err = {message: msg, astLine: line};
        errors.push(err);
        return err;
      }

      if(line >= ast.lines.length - 1) {
        infos.state.finished = true;
        return ;
      }

      line += 1;

      var it = lines[line], modl, args/* = []*/, i, res, type, modlScope, store;

      switch(it.action) {
        case 'call-module':
          modl = modules[it.name] || Largo.native_modules[it.name];

          if(modl.content) { // user-defined module
            scope.push(_clone(modl.scopeVars)); modlScope = scope[scope.length - 1];

            for(i = 0; i < it.args.length; i++) {
              /**modlArg = modl.args[i];
              modlScope[modlArg.name] = _clone(modlArg);
              modlScope[modlArg.name].value = it.args[i];
              delete modlScope[modlArg.name].name;**/
                modlScope[modl.args[i].name].value = formatContent(it.args[i]).value;
            }

            deletedScoped = [];

            stores.push(it.store || false);

            lines.splice.apply(lines, [line + 1, 0].concat(modl.content));
            lines.splice(line + modl.content.length + 1, 0, {action: 'close-scope'});
          } else { // native JS module
            args = [];
            for(i = 0; i < it.args.length; i++)
              args.push(_toJsValue(formatContent(it.args[i]).value)); // convert it to JS value, not to Leva value

            /*console.log(it.args);
            console.log(args);
            console.log('\n');*/
            // See script.largo
            // Sometimes assignment are not understood
            // In scope, some variables are just a value, not an object like {type: ...}
            // console.log(scope[scope.length - 1]);

            //console.log(ast.modules.version.content);
            res = modl.js.apply(this, args);

            if(modl.type !== 'void' && it.store) {
              type = formatContent(res, true).type;

              if(type.msg)
                return error('Native module "' + it.name + '" returned a bad value : ' + type.msg);

              if(modl.type !== type)
                return error('Native module "' + it.name + '" must returns `' + modl.type + '`, `' + type + '` returned');

              //console.log([it.name, it.store, res]);

              if(it.store.substr(0, 7) === '$stack:') // store in stack
                stack[it.store.substr(7)] = {type: type, value: res};
              else  // store in variable
                (variables[it.store] || scope[scope.length - 1][it.store]).value = res;
            }
          }

          break;

        case 'close-scope':
          deletedScoped = [];
          scope.pop();
          modlScope = null;
          break;

        case 'delete-variable':
          if(variables.hasOwnProperty(it.name)) {
            delete variables[it.name];
            deletedVariables.push(it.name);
          } else {
            delete scope[scope.length - 1][it.name];
            deletedScoped.push(it.name);
          }

          break;

        case 'var-assign-value':
          (variables[it.name] || scope[scope.length - 1][it.name]).value = it.value;
          break;

        case 'return':
          store = stores[stores.length - 1];
          stores.splice(stores.length - 1, 1);

          if(store) {
            if(store.substr(0, 7) === '$stack:') // store in stack
              stack[store.substr(7)] = formatContent(it.value);
            else // store in variable
                 // Because we are in a module, there is (at least) two scopes
              (variables[store] || scope[scope.length - 2][store]).value = res;
          }

          while(lines[line].action !== 'close-scope')
            line++;

          line--;

          break;

        default:
          return error('Unknown AST instruction : "' + it.action + '"');
          break;
      }
    };

    /**
      * Run script
      * @return {object|boolean|void} Can returns an error message (from @runStep)
      */
    this.start = function() {
      if(running) {
        console.log('NOTICE: @start was ignored, function is already running');
        return false;
      }

      started = true;
      var d, ans;

      if(infos.state.finished) {
        console.log('NOTICE: @start was ignored, script is already finished');
        return ;
      }

      while(!infos.state.finished) {
        d = Date.now();
        ans = this.runStep();

        infos.benchmark.durations.push(Date.now() - d);
        infos.benchmark.duration += infos.benchmark.durations[infos.benchmark.durations.length - 1];

        if(ans)
          return ans;
      }

      started = false;
      this.trigger('finished');
    };

    /**
      * Pause script
      */
    this.pause = function() {
      infos.state.paused = false;
    };

    /**
      * Resume script
      */
    this.resume = function() {
      if(!infos.state.paused) {
        infos.state.paused = true;
        return this.start();
      }
    };

    /**
      * Get informations
      * @param {string} Info you want
      * @return {object|boolean} If error, returns false
      */
    this.get = function(name) {
      if(!infos.hasOwnProperty(name) && name !== 'errors' && name !== 'error')
        return false;

      return _clone(name === 'error' ? errors[errors.length - 1] : (name === 'errors' ? errors : infos[name]));
    };

    /**
      * Check if a variable exists
      * @param {string} name
      * @return {boolean}
      */
    this.isset = function(name) {
      return (native_vars.hasOwnProperty(name) || variables.hasOwnProperty(name) || scope[scope.length - 1].hasOwnProperty(name));
    };

    /**
      * Get a variable
      * @param {string} name
      * @return {object}
      */
    this.get_var = function(name) {
      var res = native_vars[name] || variables[name] || scope[scope.length - 1][name];
      return res ? _clone(res) : false;
    };

    /**
      * Check if a variable is a constant
      * @param {string} name
      * @return {boolean}
      */
    this.is_constant = function(name) {
      return ({})[name] || native_vars.hasOwnProperty(name) || (variables[name] && variables[name].constant) || (scope[scope.length - 1][name] && scope[scope.length - 1][name].constant);
    };

    if(options.autoStart)
      this.start();
  };

  /**
    * Format a variable's declaration
    * @param {string} dclr Variable declaration
    * @param {boolean} [allowOptionnal] If set to true, allows optionnal variables (in module's arguments)
    * @return {object|boolean}
    */
  this.formatVar = function(dclr, allowOptionnal) {
    var match;
    dclr = dclr.trim();

    if(match = dclr.matchr(/{dclr_type}{s}{anumu_dollar}/)) {
      var a = {};
      a.name = match[3];
      a.type = match[2];

      if(match[1])
        a.constant = true;

      if(match[3].substr(0, 1) === '$' && allowOptionnal) {
        a.optionnal = true;
        a.name      = match[3].substr(1);
      }

      return a;
    }

    return false;
  };

  this.native_modules = {
    display: {
      type: 'void',
      args: [ { name: 'message', type: 'mixed' } ],
      js: function(message) {
        console.log(message);
      }
    },

    displayln: {
      type: 'void',
      args: [],
      js: function() { console.log(); }
    },

    prompt: {
      type: 'string',
      args: [ { name: 'message', type: 'mixed', optionnal: true } ],
      js: function(message) {
        return require('readline-sync').question(message || '');
      }
    },

    scoped: {
      type: 'bool',
      args: [ { name: 'variable', type: 'string' } ],
      js: function(variable) {
        return this.hasScope && this.scope.hasOwnProperty(variable);
      }
    },

    isset: {
      type: 'bool',
      args: [ { name: 'name', type: 'string' } ],
      js: function(name) {
        return this.isset(name);
      }
    },

    module_exists: {
      type: 'bool',
      args: [ { name: 'name', type: 'string' } ],
      js: function(name) {
        return Largo.native_modules.hasOwnProperty(name) || this.modules.hasOwnProperty(name);
      }
    },

    substr: {
      type: 'string',
      args: [ { name: 'str', type: 'string' }, { name: 'start', type: 'number' }, { name: 'length', type: 'number', optionnal: true } ],
      js: function(str, start, length) {
        return str.substr(start, length);
      }
    },

    join: {
      type: 'string',
      args: ['*'],
      js: function() {
        var str = '';

        for(var i = 0; i < arguments.length; i++)
          str += arguments[i].toString();

        return str;
      }
    },

    ucfirst: {
      type: 'string',
      args: [ { name: 'str', type: 'string' } ],
      js: function(str) {
        return str.substr(0, 1).toLocaleUpperCase() + str.substr(1);
      }
    },

    lcfirst: {
      type: 'string',
      args: [ { name: 'str', type: 'string' } ],
      js: function(str) {
        return str.substr(0, 1).toLocaleLowerCase() + str.substr(1);
      }
    },

    exit: {
      args: [],
      type: 'void',
      js: function() { process.exit(); }
    },

    toString: {
      type: 'string',
      args: [ { name: 'input', type: 'mixed' } ],
      js: function(input) {
        return input.toString();
      }
    },

    toNumber: {
      type: 'number',
      args: [ { name: 'input', type: 'mixed' } ],
      js: function(input) {
        return Number.isNaN(input = parseInt(input)) ? 0 : input;
      }
    }
  };

  this.native_variables ={ // Constant variables
    version: {
      type: 'string',
      value: '0.1.0'
    },

    SCOPE_LEVEL: {
      type: 'number',
      value: 0
    },

    __module: {
      type: 'string',
      value: ''
    }
  };

};

if(typeof module === 'object')
  module.exports = (Largo = new Largo());
else
  window.Largo = (Largo = new Largo());

REGS.dclr_type = '(const |)(' + Largo.types.join('|') + ')';
REGS.type = '(' + Largo.types.join('|') + ')';
REGS.alphanum = '([a-zA-Z0-9]+)';
REGS.anumu = '([a-zA-Z0-9_]+)';
REGS.anumu_dollar = '([a-zA-Z0-9_\\$]+)';
REGS.access = '(public|protected|private)';
REGS.s = REGS.spaces = ' +';
REGS.s_ = ' *';
REGS.call_arguments = '(.*)';
REGS.arguments = '([a-zA-Z0-9_ ,\\$]*)';

REGS.var = REGS.anumu;
