import * as ts from 'typescript';
import * as util from '../util';
import { Mutator } from './Mutator';

type MethodLikeProperty = ts.ConstructorDeclaration | ts.MethodDeclaration |
  ts.SetAccessorDeclaration | ts.GetAccessorDeclaration;

export class ClassDeclarationMutator extends Mutator {

  protected kind = ts.SyntaxKind.ClassDeclaration;

  protected mutate(node: ts.ClassDeclaration): ts.Node {
    const members: ts.ClassElement[] = [];

    for (let member of node.members) {
      switch (member.kind) {
        case ts.SyntaxKind.Constructor:
        case ts.SyntaxKind.MethodDeclaration:
        case ts.SyntaxKind.GetAccessor:
        case ts.SyntaxKind.SetAccessor:
          members.push(this.mutateMethodDeclaration(member as MethodLikeProperty));
          break;
        case ts.SyntaxKind.PropertyDeclaration:
          members.push(this.mutatePropertyDeclaration(member as ts.PropertyDeclaration));
          break;
        case ts.SyntaxKind.IndexSignature:
        default:
          members.push(member);
      }
    }

    this.assertImplementing(node, members);
    this.declareTypeParameters(node, members);
    this.setMerged(node);

    return this.map(node, ts.updateClassDeclaration(
      node, this.reflectClass(node), node.modifiers, node.name,
      node.typeParameters, node.heritageClauses, members
    ));
  }

  private setMerged(node: ts.ClassDeclaration) {
    const nodeInfo = this.scanner.getInfo(node);

    if (!nodeInfo) {
      return;
    }

    this.context.setMerged(nodeInfo.typeInfo.symbol);
  }

  private reflectClass(node: ts.ClassDeclaration): ts.Decorator[] {
    const classReflection = this.factory.classReflection(node);
    const decorators = util.asNewArray(node.decorators);
    const decorator = ts.createDecorator(this.factory.annotate(classReflection));

    decorators.unshift(decorator);

    return decorators;
  }

  private assertImplementing(node: ts.ClassDeclaration, members: ts.ClassElement[]): ts.ClassElement[] {
    const implementsClause = util.getImplementsClause(node);

    if (!implementsClause) {
      return members;
    }

    let constructor = this.getConstructor(members);
    let statements = util.asNewArray(constructor.body.statements);

    for (let impl of implementsClause.types || []) {
      const nodeInfo = this.scanner.getInfo(impl);

      if (!nodeInfo || !nodeInfo.typeInfo.isReference) {
        continue;
      }

      const typeNode = nodeInfo.typeNode as ts.TypeReferenceNode;

      statements.push(
        ts.createStatement(
          this.factory.typeAssertion(
            this.factory.typeReferenceReflection(typeNode),
            ts.createThis()
          )
        )
      );
    }

    this.updateConstructor(members, constructor, statements);

    return members;
  }

  private declareTypeParameters(node: ts.ClassDeclaration, members: ts.ClassElement[]): ts.ClassElement[] {
    if (!util.hasTypeParameters(node)) {
      return members;
    }

    const extendsClause = util.getExtendsClause(node);
    let constructor = this.getConstructor(members);
    let statements: ts.Statement[] = util.asNewArray(constructor.body.statements);

    let typeParametersStatement: ts.Statement;
    let thisStatement: ts.Statement;
    let bindStatement: ts.Statement;

    typeParametersStatement = this.factory.typeParametersLiteralDeclaration(node.typeParameters);
    thisStatement = this.factory.classTypeParameterSymbolConstructorDeclaration(node.name);

    if (util.extendsClauseHasTypeArguments(extendsClause)) {
      bindStatement = this.factory.typeParameterBindingDeclaration(
        extendsClause.types[0].typeArguments
      );
    }

    this.insertBeforeSuper(statements, typeParametersStatement);
    this.insertAfterSuper(statements, [thisStatement, bindStatement].filter(statement => !!statement));
    this.updateConstructor(members, constructor, statements);

    members.unshift(this.factory.classTypeParameterSymbolPropertyDeclaration(node.name));

    return members;
  }

  // private getClassTypeParametersDeclaration(node: ts.ClassElement) {
  //
  // }

  private mutatePropertyDeclaration(node: ts.PropertyDeclaration): ts.PropertyDeclaration {
    if (this.context.isAny(node.type)) {
      return node;
    }

    const decorators = util.asNewArray(node.decorators);
    const typeReflection = this.factory.typeReflection(node.type);

    let decorator: ts.Decorator;

    if (util.hasKind(typeReflection, ts.SyntaxKind.ThisKeyword)) {
      decorator = ts.createDecorator(this.factory.decorate(
        ts.createFunctionExpression(undefined, undefined, undefined, undefined, undefined, undefined,
          ts.createBlock([ts.createReturn(typeReflection)], true)
        )
      ));
    } else {
      decorator = ts.createDecorator(this.factory.decorate(typeReflection));
    }

    decorators.unshift(decorator);

    return this.map(node, ts.updateProperty(node, decorators, node.modifiers, node.name, node.type, node.initializer));
  }

  private mutateMethodDeclaration(node: MethodLikeProperty): MethodLikeProperty {
    return this.factory.mutateFunctionBody(node) as MethodLikeProperty;
  }

  private getConstructor(members: ts.ClassElement[], create = true): ts.ConstructorDeclaration {
    const index = members.findIndex(member => member.kind === ts.SyntaxKind.Constructor);
    const exists = index !== -1;

    if (exists) {
      return members[index] as ts.ConstructorDeclaration;
    }

    if (!create) {
      return null;
    }

    const extendsClause = util.getExtendsClause(this.node as ts.ClassDeclaration);
    const isExtending = !!extendsClause;

    const constructor = ts.createConstructor(
      undefined, undefined,
      isExtending
        ? [ts.createParameter(undefined, undefined, ts.createToken(ts.SyntaxKind.DotDotDotToken), 'args')]
        : undefined,
      ts.createBlock(
        isExtending
          ? [ts.createStatement(
            ts.createCall(ts.createSuper(), undefined, [ts.createSpread(ts.createIdentifier('args'))])
          )] : [],
        true
      )
    );

    return constructor;
  }

  private insertBeforeSuper(statements: ts.Statement[], insert: ts.Statement | ts.Statement[], offset = 0): ts.Statement[] {
    const index = statements.findIndex(statement => util.isSuperStatement(statement));

    insert = util.asArray(insert);

    if (index !== -1) {
      statements.splice(index + offset, 0, ...insert)
    } else {
      statements.splice(statements.length, 0, ...insert);
    }

    return statements;
  }

  private insertAfterSuper(statements: ts.Statement[], insert: ts.Statement | ts.Statement[], offset = 0): ts.Statement[] {
    return this.insertBeforeSuper(statements, insert, 1);
  }

  private updateConstructor(members: ts.ClassElement[], constructor: ts.ConstructorDeclaration, statements: ts.Statement[]): ts.ClassElement[] {
    const index = members.findIndex(member => member.kind === ts.SyntaxKind.Constructor);
    const exists = index !== -1;

    constructor = this.map(constructor, ts.updateConstructor(
      constructor,
      constructor.decorators,
      constructor.modifiers,
      constructor.parameters,
      this.map(constructor.body, ts.updateBlock(constructor.body, statements))
    ));

    if (exists) {
      members[index] = constructor;
    } else {
      members.unshift(constructor);
    }

    return members;
  }

}
