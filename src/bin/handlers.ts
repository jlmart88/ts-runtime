import * as cp from 'child_process';
import * as path from 'path';
import * as ts from 'typescript';
import * as bus from '../bus';
import * as util from './util';
import { Options } from '../options';

const child = cp.fork(path.join(__dirname, './status'));
let childIsRunning = true;

let options: Options;

bus.on(bus.events.INTERNAL_OPTIONS, (opts: Options) => {
  options = opts;
});

function killChild() {
  if (childIsRunning) {
    child.kill();
    childIsRunning = false;
  }
}

process.on('exit', () => {
  killChild();
  process.exit(0);
});

process.on('SIGINT', () => {
  killChild();
  process.exit(0);
});

process.on('SIGTERM', () => {
  killChild();
  process.exit(0);
});

child.on('exit', code => {
  childIsRunning = false;
  process.exit(code);
});

function handleError(error: string | Error) {
  if (childIsRunning) {
    child.send({ message: 'error', payload: util.getError(error, options) });
  } else {
    process.exit(1);
  }
}

process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

bus.on(bus.events.ERROR, handleError);

bus.on(bus.events.WARN, (args: any[]) => {
  child.send({ message: 'warn', payload: args });
});

bus.on(bus.events.START, (args: any[]) => {
  child.send({ message: 'start', payload: args });
});

bus.on(bus.events.SCAN, (args: any[]) => {
  child.send({ message: 'scan', payload: args });
});

bus.on(bus.events.TRANSFORM, (args: any[]) => {
  const sourceFiles = args[0] as ts.SourceFile[];
  const time = args[1];
  const fileNames = sourceFiles.map(sf => sf.fileName);

  child.send({ message: 'transform', payload: [fileNames, time] });
});

bus.on(bus.events.DIAGNOSTICS, (args: any[]) => {
  const diagnostics = args[0] as ts.Diagnostic[];
  let formatted: string[] = [];

  for (let diag of diagnostics) {
    formatted.push(ts.formatDiagnostics([diag], {
      getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
      getNewLine: () => ts.sys.newLine,
      getCanonicalFileName: (f: string) => f
    }).trim());
  }

  const diags = formatted.filter(str => str.trim().length > 0);

  let i, j, temp, chunk = 10;
  for (i = 0, j = formatted.length; i < j; i += chunk) {
    temp = formatted.slice(i, i + chunk);
    child.send({ message: 'diagnostics', payload: [temp] });
  }
});

bus.on(bus.events.CLEANUP, (args: any[]) => {
  child.send({ message: 'cleanup', payload: args });
});

bus.on(bus.events.STOP, (args: any[]) => {
  child.send({ message: 'stop', payload: args });
});

bus.on(bus.events.END, (args: any[]) => {
  child.send({ message: 'end', payload: args });
});
