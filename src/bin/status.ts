import * as path from 'path';
import * as ora from 'ora';
import * as chalk from 'chalk';
import * as symbols from 'log-symbols';
import * as util from './util';

const version = require('../../package.json').version;
let spinner: any = ora();
let current = 'Processing';
let currentPast = 'Processed';
let hasErrors = false;
let numDiagnostics = 0;
let warnings: string[] = [];

process.on('uncaughtException', (error: Error) => {
  status.error(error);
});

process.on('unhandledRejection', (reason: any, p: any) => {
  status.error(new Error(reason));
});

process.on('SIGINT', () => {
  status.term();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('TERM')
  status.term();
  process.exit(0);
});

process.on('message', (data: { message: string, payload: any, info?: any }) => {
  if (typeof status[data.message] === 'function') {
    status[data.message](data.payload, data.info);
  }
});

const status: any = {};

status.init = () => {
  spinner = null;
  spinner = ora();
};

status.start = (args: any[]) => {
  current = 'Processing';
  currentPast = 'Processed';
  spinner.info(chalk.bold(`ts-runtime v${version}`));
  spinner.text = current;
  spinner.start();
  return spinner;
};

status.transform = (fileNames: string[], time: string) => {
  spinner.succeed(`${current} (${time})`);
  current = 'Transforming';
  currentPast = 'Transformed';
  spinner.text = chalk.bold(current);
  spinner.start();
  return spinner;
};

status.scan = (args: any[], time: string) => {
  spinner.succeed(`${current} (${time})`);
  current = 'Scanning';
  currentPast = 'Scanned';
  spinner.text = chalk.bold(current);
  spinner.start();
  return spinner;
};

status.cleanup = (args: any[], time: string) => {
  spinner.succeed(`${current} (${time})`);
  current = 'Cleaning';
  currentPast = 'Cleaned';
  spinner.text = chalk.bold(current);
  spinner.start();
  return spinner;
};

status.diagnostics = (diags: string[], total?: number) => {
  const text = spinner.text;
  numDiagnostics += total || diags.length;

  for (let diag of diags) {
    spinner.fail(diag);
  }

  if (total > diags.length) {
    spinner.fail(chalk.bold(`Showing first ${diags.length} diagnistics, ${total - diags.length} were hidden.`))
  }

  spinner.text = text;
  spinner.start();
  return spinner;
};

status.end = (args: any[], time: string[]) => {
    spinner.succeed(`${current} (${time[0]})`);

  for (let warning of warnings) {
    spinner.warn(chalk.yellow(warning));
  }

  if (hasErrors) {
    spinner.fail(chalk.red.bold(`Done in ${time[1]}, but there were errors.`));
  } else if (numDiagnostics > 0) {
    let wasWere = numDiagnostics === 1 ? 'was' : 'were';
    let diagPlural = numDiagnostics === 1 ? 'diagnostic' : 'diagnostics';
    let text = `Done in ${time[1]}, but there ${wasWere} ${numDiagnostics} compiler ${diagPlural}`;
    if (warnings.length > 0) {
      let warningPlural = warnings.length === 1 ? 'warning' : 'warnings';
      text += ` and ${warnings.length} ${warningPlural}`
    }
    spinner.succeed(chalk.yellow.bold(`${text}.`));
  } else if (warnings.length > 0) {
    let wasWere = warnings.length === 1 ? 'was' : 'were';
    let warningPlural = warnings.length === 1 ? 'warning' : 'warnings';
    spinner.succeed(chalk.yellow.bold(`Done in ${time[1]}, but there ${wasWere} ${warnings.length} ${warningPlural}.`));
  } else {
    spinner.succeed(chalk.green.bold(`Done in ${time[1]}.`));
  }

  process.exit(0);
};

status.warn = (warning: string) => {
  if (warnings.indexOf(warning) === -1) {
    warnings.push(warning);
  }
}

status.stop = (...args: any[]) => {
  hasErrors = true;
  status.error();
};

status.term = () => {
  hasErrors = true;

  spinner.fail(chalk.red.bold(`${current} was interrupted.`));
};

status.error = (error: string | Error) => {
  hasErrors = true;

  let err = util.getError(error);

  if (err) {
    spinner.fail(err);
  }

  status.term();
  process.exit(1);
};
