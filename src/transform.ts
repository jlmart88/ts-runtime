import * as path from 'path';
import * as rimraf from 'rimraf';
import * as ts from 'typescript';
import * as util from './util';
import * as bus from './bus';
import { MutationContext } from './context';
import { mutators } from './mutators';
import { Options, defaultOptions } from './options';

const DEBUG = false;

export function transform(entryFile: string, options?: Options) {
  options = getOptions(options);

  const basePath = path.dirname(entryFile);

  let tempEntryFile: string = entryFile;
  let host: ts.CompilerHost;
  let program: ts.Program;

  (function autoStartTransformation(): void {
    let sourceFiles: ts.SourceFile[];

    deleteTempFiles();

    host = ts.createCompilerHost(options.compilerOptions, true);
    program = ts.createProgram([entryFile], options.compilerOptions, host);

    const diagnostics: ts.Diagnostic[] = [];

    diagnostics.push(...program.getOptionsDiagnostics());
    diagnostics.push(...program.getGlobalDiagnostics());

    for (let sourceFile of program.getSourceFiles().filter(sf => !/\.d\.ts$/.test(sf.fileName))) {
      diagnostics.push(...program.getSyntacticDiagnostics(sourceFile));
      diagnostics.push(...program.getSemanticDiagnostics(sourceFile));
    }

    // Check original file (pre-diagnostics)
    check(diagnostics);

    sourceFiles = program.getSourceFiles().filter(sf => !sf.isDeclarationFile);
    const typedResult = ts.transform(sourceFiles, [firstPassTransformer], options.compilerOptions);

    writeTempFiles(typedResult);
    typedResult.dispose();

    createProgramFromTempFiles();

    sourceFiles = program.getSourceFiles().filter(sf => !sf.isDeclarationFile);
    const result = ts.transform(sourceFiles, [transformer], options.compilerOptions);

    writeTempFiles(result);
    result.dispose();

    // do not check post-diagnostics of temp file
    // check(result.diagnostics)

    emitTransformed();

    if (!options.keepTempFiles) {
      deleteTempFiles();
    }
  })();

  function deleteTempFiles(): void {
    const tempPath = getTempPath(basePath, options.tempFolderName);
    rimraf.sync(getTempPath(basePath, options.tempFolderName));
  }

  function createProgramFromTempFiles(): void {
    tempEntryFile = toTempFilePath(tempEntryFile, path.dirname(tempEntryFile), options.tempFolderName);
    host = ts.createCompilerHost(options.compilerOptions);
    program = ts.createProgram([tempEntryFile], options.compilerOptions, host, undefined);
  }

  function writeTempFiles(result: ts.TransformationResult<ts.SourceFile>): void {
    const printerOptions: ts.PrinterOptions = {
      removeComments: false
    };

    const printHandlers: ts.PrintHandlers = {
      substituteNode(hint: ts.EmitHint, node: ts.Node): ts.Node {
        return node;
      }
    };

    const printer = ts.createPrinter(printerOptions, printHandlers);

    let count = 0;
    for (let transformed of result.transformed) {
      count++;
      const location = toTempFilePath(transformed.fileName, basePath, options.tempFolderName);
      const source = printer.printFile(transformed);
      ts.sys.writeFile(location, source);
    }
  }

  function emitTransformed() {
    options.compilerOptions.outDir = path.dirname(entryFile);

    createProgramFromTempFiles();

    const diagnostics: ts.Diagnostic[] = [];

    diagnostics.push(...program.getOptionsDiagnostics());
    diagnostics.push(...program.getGlobalDiagnostics());

    for (let sourceFile of program.getSourceFiles().filter(sf => !/\.d\.ts$/.test(sf.fileName))) {
      diagnostics.push(...program.getSyntacticDiagnostics(sourceFile));
      diagnostics.push(...program.getSemanticDiagnostics(sourceFile));
    }

    // do not check pre-diagnostics of temp file
    // check(diagnostics);

    const emitResult = program.emit();

    // check final result (post-diagnostics)
    check(emitResult.diagnostics);
  }

  let mutationContext: MutationContext;
  let currentSourceFile: ts.SourceFile;
  function setMutationContext(node: ts.Node, context: ts.TransformationContext): void {
    if (node.kind === ts.SyntaxKind.SourceFile/* && currentSourceFile !== node */) {
      currentSourceFile = node as ts.SourceFile;
      mutationContext = new MutationContext(options, node as ts.SourceFile, program, host, context);
    }
  }

  function onBeforeVisit(node: ts.Node, mc: MutationContext, tc: ts.TransformationContext): ts.Node {
    return node;
  }

  function onAfterVisit(node: ts.Node, mc: MutationContext, tc: ts.TransformationContext): ts.Node {
    mc.addVisited(node);
    return node;
  }

  function firstPassTransformer(context: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
    const visited: ts.Node[] = [];

    const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
      setMutationContext(node, context);

      if (mutationContext.wasVisited(node)) {
        return node;
      }

      if (!(node as any).type) {
        let type: ts.TypeNode;
        switch (node.kind) {
          case ts.SyntaxKind.Parameter:
          case ts.SyntaxKind.PropertySignature:
          case ts.SyntaxKind.PropertyDeclaration:
          case ts.SyntaxKind.MethodSignature:
          case ts.SyntaxKind.CallSignature:
          case ts.SyntaxKind.ConstructSignature:
          case ts.SyntaxKind.IndexSignature:
          case ts.SyntaxKind.VariableDeclaration:
            type = mutationContext.getImplicitTypeNode((node as any).name || node);
            break;
          case ts.SyntaxKind.MethodDeclaration:
          case ts.SyntaxKind.Constructor:
          case ts.SyntaxKind.GetAccessor:
          case ts.SyntaxKind.SetAccessor:
          case ts.SyntaxKind.FunctionExpression:
          case ts.SyntaxKind.ArrowFunction:
          case ts.SyntaxKind.FunctionDeclaration:
            type = mutationContext.getImplicitTypeNode((node as any).name || node);
            type = (type as any).type || type;
            break;
        }

        if (type) {
          (node as any).type = type;
          util.setParent(node);
          mutationContext.addVisited(type, true);
        }
      }

      mutationContext.addVisited(node);
      return ts.visitEachChild(node, visitor, context);
      // return node;
    };

    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor);
  }

  function transformer(context: ts.TransformationContext): ts.Transformer<ts.SourceFile> {
    const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
      setMutationContext(node, context);

      const parent = node.parent;
      node = onBeforeVisit(node, mutationContext, context);

      debugText('~~~~~~~~~~~~~~~~~~~~~');
      debugText('Before Mutation:');
      debugText('~~~~~~~~~~~~~~~~~~~~~');
      debugNodeAttributes(node, mutationContext);
      debugNodeText(node, mutationContext);

      for (let mutator of mutators) {
        node = mutator.mutateNode(node, mutationContext);
      }

      if (!node) {
        return node;
      }

      node.parent = parent;
      util.setParent(node);

      node = onAfterVisit(node, mutationContext, context);

      debugSpaces();
      debugText('~~~~~~~~~~~~~~~~~~~~~');
      debugText('After Mutation:');
      debugText('~~~~~~~~~~~~~~~~~~~~~');
      debugNodeAttributes(node, mutationContext);
      debugNodeText(node, mutationContext);
      debugSpaces(3);

      return ts.visitEachChild(node, visitor, context);
      // return node;
    };

    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor);
  }

}

export function getOptions(options: Options = {}): Options {
  const opts = Object.assign({}, defaultOptions, options);
  opts.compilerOptions = Object.assign({}, defaultOptions.compilerOptions, options.compilerOptions || {});
  return opts;
}

export function getRootNames(rootNames: string | string[]): string[] {
  if (Array.isArray(rootNames)) {
    return rootNames;
  }

  return [rootNames];
}

export function getTempPath(basePath: string, tempFolderName: string): string {
  return path.join(basePath, tempFolderName);
}

export function toTempFilePath(file: string, basePath: string, tempFolderName: string): string {
  const pathFromBase = path.dirname(file.replace(basePath, ''));
  const tempPath = getTempPath(basePath, tempFolderName);
  const fileName = path.basename(file);

  return path.join(tempPath, pathFromBase, fileName);
}

export function check(diagnostics: ts.Diagnostic[]): boolean {
  if (diagnostics && diagnostics.length > 0) {
    console.error(ts.formatDiagnostics(diagnostics, {
      getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
      getNewLine: () => ts.sys.newLine,
      getCanonicalFileName: (f: string) => f
    }));
    return false;
  }

  return true;
}

export function notify(event: string | symbol, ...args: any[]): boolean {
  return bus.emitter.emit(event, args);
}

function debugNodeAttributes(node: ts.Node, mutationContext: MutationContext): void {
  if (!DEBUG) return;
  const scope = util.getScope(node);
  const scopeKind = scope ? ts.SyntaxKind[scope.kind] : 'undefined';
  console.log(`Kind: ${ts.SyntaxKind[node.kind]} (${node.kind})`);
  try {
    console.log(`Implicit Type: ${mutationContext.getImplicitTypeText(node)}`);
  } catch (e) {
    console.log('Implicit Type:');
  }
  console.log(`Visited: ${mutationContext.wasVisited(node) ? 'Yes' : 'No'}`);
  console.log(`Scope: ${scopeKind}`);
  console.log(`Synthesized: ${node.flags === ts.NodeFlags.Synthesized ? 'Yes' : 'No'}`);
  console.log(`File: ${mutationContext.sourceFile.fileName}`);
}

function debugNodeText(node: ts.Node, mutstionContext: MutationContext) {
  if (!DEBUG) return;
  console.log('<============================================');
  if (node.parent) {
    if (node.flags === ts.NodeFlags.Synthesized) {
      console.log('Cannot get text of synthesized node.');
    } else {
      console.log(node.getText());
    }
  } else {
    console.log('Parent not set, cannot get text.');
  }
  console.log('============================================>');
}

function debugText(text: string) {
  if (!DEBUG) return;
  console.log(text);
}

function debugSpaces(spaces: number = 1) {
  if (!DEBUG) return;
  console.log(Array(Math.abs(spaces) + 1).join('\n'));
}
