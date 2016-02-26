#!/usr/bin/env node
// Binary file for Largo

// Get an argument
function get_arg(shortName, longName) { return args.short[shortName] || args.long[longName]; }
function has_arg(shortName, longName) { return args.short.hasOwnProperty(shortName) || args.long.hasOwnProperty(longName) || args.cmd.indexOf('-' + shortName) !== -1 || args.cmd.indexOf('--' + longName) !== -1; }
function display(msg) { console.log(msg); }
function error(msg, stack) { console.error('ERROR: ' + msg + (stack && has_arg(false, 'verbose') ? '\n' + stack : '')); process.exit(); }

// Require node.js modules
var largo    = require('./largo.js'),
    fs       = require('fs'),
    jsonpack = require('jsonpack'),
    zlib     = require('zlib');

// Declare variables
var arg, args = {short: {}, long: {}, cmd: []}, j;

// Sort arguments by reading the command-line
for(var i = 0, pargs = process.argv.slice(2); i < pargs.length; i++) {
  arg = pargs[i];

  if(arg.substr(0, 2) === '--' && (j = arg.indexOf('=')) !== -1)
    args.long[arg.substr(2, j - 2)] = arg.substr(j + 1);
  else if(arg.substr(0, 1) === '-' && (j = arg.indexOf('=')) !== -1)
    args.short[arg.substr(1, j - 1)] = arg.substr(j + 1);
  else if(arg.substr(0, 2) === '--' && pargs.length > i + 1 && pargs[i + 1].substr(0, 1) !== '-') {
    args.long[arg.substr(2)] = pargs[i + 1];
    pargs.splice(i + 1, 1);
  } else if(arg.substr(0, 1) === '-' && pargs.length > i + 1 && pargs[i + 1].substr(0, 1) !== '-') {
    args.short[arg.substr(1)] = pargs[i + 1];
    pargs.splice(i + 1, 1);
  } else
    args.cmd.push(arg);
}

function run_cmd() {
  if(has_arg('v', 'version') && args.cmd.length === 1) {
    console.log('Largo - Checker, optimizer, compiler and interpreter for Leva');
    console.log('Version : ' + largo.prefix + ' ' + largo.version);
  } else if(has_arg('b', 'build')) {
    // Pre-compile a script (AST building)
    var input = get_arg('b', 'build'), output = get_arg('o', 'output'), tbuild, tcomp;

    if(!input)  { error('No input file specified'); }
    if(!output) { error('No output file specified'); }

    try { var code = fs.readFileSync(input, 'utf-8'); }
    catch(e) { error('Failed to open input file', e.stack); }

    tbuild = Date.now();
    var ast = largo.build_ast(code);
    tbuild = Date.now() - tbuild;

    if(ast.failed)
      error('Building failed :\n    ' + ast.message + '\n    at line ' + ast.line);

    if(has_arg('e', 'extended')) {
      tpack = Date.now();
      ast   = JSON.stringify(ast, null, parseInt(get_arg('e', 'extended')) || 2);
      tpack = Date.now() - tpack;
      try { fs.writeFileSync(output, ast); }
      catch(e) { error('Failed to write output file', e.stack); }
    } else { var pack;
      tpack = Date.now();
      pack  = jsonpack.pack(ast);
      tpack = Date.now() - tpack;

      var tcomp = Date.now();
      pack = zlib.deflateSync(pack);
      tcomp = Date.now() - tcomp;

      try { fs.writeFileSync(output, pack); }
      catch(e) { error('Failed to write output file', e.stack); }
    }

    if(has_arg('p', 'performance')) {
      if(has_arg('e', 'extended')) {
        console.log('AST built   in ' + tbuild + ' ms');
        console.log('Stringified in ' + tpack  + ' ms\n');
      } else {
        var size = fs.readFileSyn
        console.log('AST built  in ' + tbuild + ' ms');
        console.log('Packed     in ' + tpack  + ' ms');
        console.log('Compressed in ' + tcomp  + ' ms');
        console.log('Size: ' + (str = JSON.stringify(ast)).length + ' -> ' + pack.length);
        console.log('Saved ' + (str.length - pack.length) + ' bytes (' + (Math.round(str.length / pack.length * 100) / 100) + 'x)');
      }
    }
  } else if(has_arg('v', 'validate')) {
    // Validate a script
    var input = get_arg('v', 'validate');

    if(!input)  { error('No input file specified'); }

    try { var code = fs.readFileSync(input, 'utf-8'); }
    catch(e) { error('Failed to open input file', e.stack); }

    var ast = largo.build_ast(code);

    if(ast.failed)
      error('There is some errors in the code :\n    ' + ast.message + '\n    at line ' + ast.line);
  }/* else if(has_arg('d', 'depth-validate')) {
    // Validate a script, including variables re-declaration....

    var input = get_arg('d', 'depth-validate');

    if(!input) { error('No input file specified'); }

    try { var code = fs.readFileSync(input, 'utf-8'); }
    catch(e) { error('Failed to open input file', e.stack); }

    var ast = largo.build_ast(code);

    if(ast.failed)
      error('There is some errors in the code :\n    ' + ast.message + '\n    at line ' + ast.line);

    var found = largo.depth_validate(ast);

    if(Array.isArray(found)) {
      display(found.length + ' error' + (found.length > 1 ? 's' : '') + ' found');

      for(var i = 0; i < found.length; i++)
        display('    TL ' + found[i].treeLine + ' : ' + found[i].message);

      process.exit();
    }

    display('Code is valid, no error found');
  }*/ else {
    // Run a script
    try { var code = fs.readFileSync(args.cmd[0]); }
    catch(e) { error('Failed to open input file', e.stack); }

    if(has_arg('a', 'ast')) {
      try {
        code = jsonpack.unpack(zlib.inflateSync(code).toString('utf8'));
      }

      catch(e_) {
        try { code = JSON.parse(code.toString('utf-8')); }
        catch(e) { error('Failed to uncompress input', e_.stack); }
      }
    } else code = code.toString('utf8');

    var res = largo.run(code, {allowHigherVersion: has_arg(false, 'allow-higher-version')});

    if(res.failed) {
      display('ERROR: ' + res.message + '\n    At tree line ' + res.astLine);
      //if(has_arg('v', 'verbose')) display(res.astLine);
      process.exit();
    }

    if(typeof res === 'string')
      error(res.replace(/^([0-9]+)\|(.*)$/, 'At tree line $1\n    $2'));

    if(has_arg('p', 'performance') && !res.failed) {
      display(' ');
      display('Script runned in ' + ((res.astBuilding || 0) + res.duration) + ' ms');
      display('AST built     in ' + (res.astBuilding || '--') + ' ms');
      display('AST runned    in ' + res.duration + ' ms');
    }
  }
}

// Use a separated function permit to make tasks like file watching easier
run_cmd();
