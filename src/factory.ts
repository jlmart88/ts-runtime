import * as ts from 'typescript';
import * as util from './util';
import { MutationContext } from './context';

export class Factory {

  private _context: MutationContext;
  private _strictNullChecks: boolean;
  private _lib: string;
  private _namespace: string;

  // TODO: check ts.SyntaxKind.QualifiedName (e.g. B.One if B is an enum)

  constructor(context: MutationContext, strictNullChecks = false, lib = 't', namespace = '_') {
    this._context = context;
    this._lib = lib;
    this._namespace = namespace;
    this._strictNullChecks = strictNullChecks;
  }

  public typeReflection(node: ts.TypeNode): ts.Expression {
    if (!node) {
      return this.anyTypeReflection();
    }

    switch (node.kind) {
      case ts.SyntaxKind.ParenthesizedType:
        return this.typeReflection((node as ts.ParenthesizedTypeNode).type);
      case ts.SyntaxKind.AnyKeyword:
        return this.anyTypeReflection();
      case ts.SyntaxKind.NumberKeyword:
        return this.numberTypeReflection();
      case ts.SyntaxKind.BooleanKeyword:
        return this.booleanTypeReflection();
      case ts.SyntaxKind.StringKeyword:
        return this.stringTypeReflection();
      case ts.SyntaxKind.SymbolKeyword:
        return this.symbolTypeReflection();
      case ts.SyntaxKind.ObjectKeyword:
        return this.objectTypeReflection();
      case ts.SyntaxKind.VoidKeyword:
        return this.voidTypeReflection();
      case ts.SyntaxKind.NullKeyword:
        return this.nullTypeReflection();
      case ts.SyntaxKind.UndefinedKeyword:
        return this.undefinedTypeReflection();
      case ts.SyntaxKind.ThisType:
        return this.thisTypeReflection();
      case ts.SyntaxKind.LiteralType:
        return this.literalTypeReflection(node as ts.LiteralTypeNode);
      case ts.SyntaxKind.ArrayType:
        return this.arrayTypeReflection(node as ts.ArrayTypeNode);
      case ts.SyntaxKind.TupleType:
        return this.tupleTypeReflection(node as ts.TupleTypeNode);
      case ts.SyntaxKind.UnionType:
        return this.unionTypeReflection(node as ts.UnionTypeNode);
      case ts.SyntaxKind.IntersectionType:
        return this.intersectionTypeReflection(node as ts.IntersectionTypeNode);
      case ts.SyntaxKind.TypeReference:
        return this.typeReferenceReflection(node as ts.TypeReferenceNode);
      case ts.SyntaxKind.FunctionType:
        return this.functionTypeReflection(node as ts.FunctionTypeNode);
      case ts.SyntaxKind.ConstructorType:
        return this.constructorTypeReflection(node as ts.ConstructorTypeNode);
      case ts.SyntaxKind.TypeLiteral:
        return this.typeLiteralReflection(node as ts.TypeLiteralNode);
      case ts.SyntaxKind.TypeQuery:
        return this.typeQueryReflection(node as ts.TypeQueryNode);
      case ts.SyntaxKind.TypeParameter: // generics // TODO: implement
      case ts.SyntaxKind.TypePredicate: // function a(pet: Fish | Bird) pet is Fish // TODO: implement
      case ts.SyntaxKind.MappedType: // TODO: implement
      // type Readonly<T> = {
      //   readonly [P in keyof T]: T[P];
      // }
      case ts.SyntaxKind.IndexedAccessType: // TODO: implement
      case ts.SyntaxKind.ExpressionWithTypeArguments: // TODO: implement (extends SomeType)
      case ts.SyntaxKind.TypeOperator: // TODO: implement
      default:
        throw new Error(`No reflection for syntax kind '${ts.SyntaxKind[node.kind]}' found.`);
    }
  }

  // public getImplicitTypeNodeOrOriginal(node: ts.TypeNode): ts.TypeNode {
  //   const original = node;
  //
  //   node = this.context.getImplicitTypeNode(node);
  //
  //   if (node.kind !== original.kind) {
  //     node = original;
  //   }
  //
  //   return node;
  // }

  public typeAliasSubstitution(name: string | ts.Identifier, args: ts.Expression | ts.Expression[]): ts.Expression {
    args = util.asArray(args);
    args.unshift(ts.createLiteral(name as any));
    return this.libCall('type', args);
  }

  public interfaceSubstitution(name: string | ts.Identifier, args: ts.Expression | ts.Expression[]): ts.Expression {
    return this.typeAliasSubstitution(name, args);
  }

  // public interfaceSubstitution(node: ts.InterfaceDeclaration): ts.Expression {
  //   return this.propertyAccessCall(this.lib, 'type', [
  //     ts.createLiteral(node.name),
  //     this.nullify(this.libCall('object', this.typeElementsReflection(node.members)))
  //   ])
  // }

  public typeDeclaration(name: string | ts.Identifier | ts.ObjectBindingPattern | ts.ArrayBindingPattern, node: ts.TypeNode): ts.VariableDeclaration {
    return ts.createVariableDeclaration(name, undefined, this.typeReflection(node));
  }

  public typeAssertion(id: string | ts.Expression, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
    return this.propertyAccessCall(id, 'assert', args);
  }

  public typeReflectionAndAssertion(node: ts.TypeNode, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
    return this.typeAssertion(this.typeReflection(node), args);
  }

  public anyTypeReflection(): ts.Expression {
    return this.libCall('any');
  }

  public numberTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('number'));
  }

  public booleanTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('boolean'));
  }

  public stringTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('string'));
  }

  public symbolTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('symbol'));
  }

  public objectTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('object'));
  }

  public voidTypeReflection(): ts.Expression {
    return this.libCall('union', [this.libCall('null'), this.libCall('void')]);
  }

  public nullTypeReflection(): ts.Expression {
    return this.libCall('null');
  }

  public undefinedTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('void'));
  }

  public thisTypeReflection(): ts.Expression {
    return this.nullify(this.libCall('this', ts.createThis()));
  }

  public literalTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    switch (node.literal.kind) {
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
        return this.booleanLiteralTypeReflection(node);
      case ts.SyntaxKind.StringLiteral:
        return this.stringLiteralTypeReflection(node);
      case ts.SyntaxKind.NumericLiteral:
        return this.numericLiteralTypeReflection(node);
      case ts.SyntaxKind.ComputedPropertyName:
      default:
        throw new Error(`No literal type reflection for syntax kind '${ts.SyntaxKind[node.literal.kind]}' found.`);
    }
  }

  public booleanLiteralTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    return this.nullify(this.libCall('boolean', ts.createLiteral(
      node.literal.kind === ts.SyntaxKind.TrueKeyword ? true : false
    )));
  }

  public numericLiteralTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    return this.nullify(this.libCall('number', ts.createNumericLiteral(node.literal.getText())));
  }

  public stringLiteralTypeReflection(node: ts.LiteralTypeNode): ts.Expression {
    const str = node.literal.getText();
    return this.nullify(this.libCall('string', ts.createLiteral(str.substring(1, str.length - 1))));
  }

  public arrayTypeReflection(node: ts.ArrayTypeNode): ts.Expression {
    return this.nullify(this.libCall('array', this.typeReflection(node.elementType)));
  }

  public tupleTypeReflection(node: ts.TupleTypeNode): ts.Expression {
    return this.nullify(this.libCall('tuple', node.elementTypes.map(n => this.typeReflection(n))));
  }

  public unionTypeReflection(node: ts.UnionTypeNode): ts.Expression {
    return this.nullify(this.libCall('union', node.types.map(n => this.typeReflection(n))));
  }

  public intersectionTypeReflection(node: ts.IntersectionTypeNode): ts.Expression {
    return this.nullify(this.libCall('intersection', node.types.map(n => this.typeReflection(n))));
  }

  // TODO: handle enums (annotate like functions?)
  public typeReferenceReflection(node: ts.TypeReferenceNode): ts.Expression {
    let keyword = 'array';

    // console.log('\n');
    // console.log(node.parent.getText());
    // console.log(node.getText());
    // console.log('isImplicit', this.context.isImplicitTypeNode(node));
    // const original = this.context.getNodeFromImplicit(node);
    // console.log('original', !this.context.isImplicitTypeNode(original));
    // console.log(original.parent.getText());
    // console.log('wasDeclared', this.context.wasDeclared((original as ts.TypeReferenceNode).typeName));
    // console.log();

    const typeNameText: string = node.typeName.getText();
    const args: ts.Expression[] = !node.typeArguments ? [] : node.typeArguments.map(n => this.typeReflection(n));

    if (typeNameText.toLowerCase() !== 'array') {
      let identifier: ts.Expression = ts.createIdentifier(typeNameText);

      // TODO: check if self-referencing
      if (!this.context.wasDeclared(node.typeName)) {
        identifier = this.tdz(identifier);
      }

      args.unshift(identifier);
      keyword = 'ref';
    }

    return this.nullify(this.libCall(keyword, args));
  }

  public functionTypeReflection(node: ts.FunctionTypeNode | ts.ConstructorTypeNode | ts.CallSignatureDeclaration | ts.ConstructSignatureDeclaration | ts.MethodSignature, noStrictNullCheck?: boolean): ts.Expression {
    const args: ts.Expression[] = node.parameters.map(param => {
      const parameter: ts.Expression[] = [
        this.declarationNameToLiteralOrExpression(param.name),
        this.typeReflection(param.type)
      ];

      if (param.questionToken) {
        parameter.push(ts.createTrue());
      }

      return this.libCall('param', parameter);
    });

    args.push(this.libCall('return', this.typeReflection(node.type)));

    return this.nullify(this.libCall('function', args), noStrictNullCheck);
  }

  public constructorTypeReflection(node: ts.ConstructorTypeNode): ts.Expression {
    return this.functionTypeReflection(node);
  }

  // TODO: handle ComputedPropertyName
  public typeLiteralReflection(node: ts.TypeLiteralNode): ts.Expression {
    return this.nullify(this.libCall('object', this.typeElementsReflection(node.members)));
  }

  public typeQueryReflection(node: ts.TypeQueryNode): ts.Expression {
    return this.nullify(this.libCall('typeOf', ts.createIdentifier(node.exprName.getText())));
  }

  public typeElementReflection(node: ts.TypeElement): ts.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.IndexSignature:
        return this.indexSignatureReflection(node as ts.IndexSignatureDeclaration);
      case ts.SyntaxKind.PropertySignature:
        return this.propertySignatureReflection(node as ts.PropertySignature);
      case ts.SyntaxKind.CallSignature:
        return this.callSignatureReflection(node as ts.CallSignatureDeclaration);
      case ts.SyntaxKind.ConstructSignature:
        return this.constructSignatureReflection(node as ts.ConstructSignatureDeclaration);
      case ts.SyntaxKind.MethodSignature:
        return this.methodSignatureReflection(node as ts.MethodSignature);
      default:
        throw new Error(`No type element reflection for syntax kind '${ts.SyntaxKind[node.kind]}' found.`);
    }
  }

  public typeElementsReflection(nodes: ts.TypeElement[], merge = false): ts.Expression[] {
    if (merge) return this.mergedTypeElementsReflection(nodes);
    return nodes.map(node => this.typeElementReflection(node));
  }

  // TODO: Merge all function types (including construct signature and call signature)
  public mergedTypeElementsReflection(nodes: ts.TypeElement[]): ts.Expression[] {
    const mergeGroups: Map<string, ts.MethodSignature[]> = new Map();

    let elements = nodes.map(node => {
      if (node.kind === ts.SyntaxKind.MethodSignature) {
        const text = node.name.getText();

        if (!mergeGroups.has(text)) {
          mergeGroups.set(text, []);
        }

        const elements = mergeGroups.get(text);
        elements.push(node as ts.MethodSignature);

        return null;
      }

      return this.typeElementReflection(node);
    }).filter(element => !!element);

    mergeGroups.forEach((group, name) => {
      const returnTypes: ts.TypeNode[] = [];
      const hasReturnTypes: string[] = [];

      const parameterTypes: Map<number, ts.TypeNode[]> = new Map();
      const hasParameterTypes: Map<number, string[]> = new Map();

      const typeParameters: ts.TypeParameterDeclaration[] = [];
      const hasTypeParameters: string[] = [];

      for (let node of group) {
        const returnTypeText = node.type.getText();

        if (hasReturnTypes.indexOf(returnTypeText) === -1) {
          hasReturnTypes.push(returnTypeText);
          returnTypes.push(node.type);
        }

        if (node.typeParameters) {

        }

        let parameterIndex = 0;
        for (let parameter of node.parameters) {
          // const parameterNameText = parameter.name.getText();
          const parameterTypeText = parameter.type.getText();

          if (!hasParameterTypes.has(parameterIndex)) {
            hasParameterTypes.set(parameterIndex, []);
          }

          const parameterTypeTexts = hasParameterTypes.get(parameterIndex);

          if (parameterTypeTexts.indexOf(parameterTypeText) === -1) {
            parameterTypeTexts.push(parameterTypeText);

            if (!parameterTypes.has(parameterIndex)) {
              parameterTypes.set(parameterIndex, []);
            }

            parameterTypes.get(parameterIndex).push(parameter.type);
          }

          parameterIndex++;
        }
      }

      let returnTypeNode = returnTypes[0];
      if (returnTypes.length > 1) {
        returnTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
        (returnTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(returnTypes);
      }

      let parameterDeclarations: ts.ParameterDeclaration[] = [];

      parameterTypes.forEach((paramTypes, index) => {
        const param = paramTypes[0].parent as ts.ParameterDeclaration;

        let parameterTypeNode = paramTypes[0];
        if (paramTypes.length > 1) {
          parameterTypeNode = ts.createNode(ts.SyntaxKind.UnionType) as ts.TypeNode;
          (parameterTypeNode as ts.UnionTypeNode).types = ts.createNodeArray(paramTypes);
        }

        const parameterDeclaration = ts.createParameter(
          param.decorators, param.modifiers, param.dotDotDotToken, param.name,
          param.questionToken, parameterTypeNode, param.initializer
        );

        parameterDeclarations.push(parameterDeclaration);
      });

      const mergedMethodSignature = ts.createMethodSignature(
        group[0].typeParameters, parameterDeclarations, returnTypeNode, name, group[0].questionToken
      );

      elements.push(this.typeElementReflection(mergedMethodSignature));
    });

    return elements;
  }

  public indexSignatureReflection(node: ts.IndexSignatureDeclaration): ts.Expression {
    return this.libCall('indexer', [
      this.declarationNameToLiteralOrExpression(node.parameters[0].name),
      this.typeReflection(node.parameters[0].type),
      this.typeReflection(node.type)
    ]);
  }

  public propertySignatureReflection(node: ts.PropertySignature): ts.Expression {
    const args: ts.Expression[] = [
      this.propertyNameToLiteralOrExpression(node.name),
      this.typeReflection(node.type)
    ];


    if (node.questionToken) {
      args.push(ts.createTrue());
    }

    return this.libCall('property', args);
  }

  public callSignatureReflection(node: ts.CallSignatureDeclaration | ts.ConstructSignatureDeclaration, noStrictNullCheck = true): ts.Expression {
    return this.libCall('callProperty', this.functionTypeReflection(node, noStrictNullCheck));
  }

  public constructSignatureReflection(node: ts.ConstructSignatureDeclaration): ts.Expression {
    return this.callSignatureReflection(node);
  }

  public methodSignatureReflection(node: ts.MethodSignature): ts.Expression {
    return this.libCall('property', [
      this.propertyNameToLiteralOrExpression(node.name),
      this.functionTypeReflection(node)
    ]);
  }

  public propertyNameToLiteralOrExpression(node: ts.PropertyName): ts.Expression | ts.StringLiteral | ts.NumericLiteral {
    // fixes TS compiler error (property kind does not exist on type never) if using ts.SyntaxKind[node.kind] in default clause.
    const kind = node.kind;

    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        return ts.createLiteral(node.text);
      case ts.SyntaxKind.StringLiteral:
        let str = node.text;
        return ts.createLiteral(str.substring(1, str.length - 1));
      case ts.SyntaxKind.NumericLiteral:
        return ts.createNumericLiteral(node.text);
      case ts.SyntaxKind.ComputedPropertyName:
        return node.expression;
      default:
        throw new Error(`Property name for syntax kind '${ts.SyntaxKind[kind]}' could not be generated.`);
    }
  }

  public declarationNameToLiteralOrExpression(node: ts.DeclarationName): ts.Expression | ts.StringLiteral | ts.NumericLiteral {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.ComputedPropertyName:
        return this.propertyNameToLiteralOrExpression(node as ts.PropertyName);
      case ts.SyntaxKind.ObjectBindingPattern:
      case ts.SyntaxKind.ArrayBindingPattern:
      default:
        throw new Error(`Declaration name for syntax kind '${ts.SyntaxKind[node.kind]}' could not be generated.`);
    }
  }

  // public nullify(reflection: ts.Expression, notNullable?: boolean): ts.Expression {
  //   return this.strictNullChecks || notNullable ? reflection : this.libCall('nullable', reflection);
  // }

  // TODO: think about a more performant/readable/controlable way to handle strictNullChecks true/false
  public nullify(reflection: ts.Expression, notNullable?: boolean): ts.Expression {
    return reflection;
    // return this.strictNullChecks || notNullable ? reflection : this.libCall('n', reflection);
  }

  public intersect(args: ts.Expression | ts.Expression[]): ts.Expression {
    return this.libCall('intersect', args);
  }

  public tdz(body: ts.Expression): ts.Expression {
    return this.libCall(
      'tdz',
      ts.createArrowFunction(
        undefined, undefined, [], undefined,
        ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        body
      )
    );
  }

  public selfReference(name: string | ts.Identifier | ts.ObjectBindingPattern | ts.ArrayBindingPattern, body: ts.Expression): ts.Expression {
    return ts.createArrowFunction(
      undefined, undefined, [ts.createParameter(undefined, undefined, undefined, name)], undefined,
      ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      body
    );
  }

  public asObject(nodes: ts.Expression[]): ts.Expression {
    return this.libCall('object', nodes);
  }

  public asRef(arg: ts.Expression): ts.Expression {
    return this.libCall('ref', arg);
  }

  // public nullify(reflection: ts.Expression, notNullable?: boolean): ts.Expression {
  //   return this.strictNullChecks || notNullable ? reflection : this.libCall('union', [
  //     this.libCall('null'),
  //     reflection
  //   ]);
  // }

  public libCall(prop: string | ts.Identifier, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
    return this.propertyAccessCall(this.lib, prop, args);
  }

  public propertyAccessCall(id: string | ts.Expression, prop: string | ts.Identifier, args: ts.Expression | ts.Expression[] = []): ts.CallExpression {
    id = typeof id === 'string' ? ts.createIdentifier(id) : id;
    args = util.asArray(args);

    return ts.createCall(ts.createPropertyAccess(id, prop), undefined, args);
  }

  get context(): MutationContext {
    return this._context;
  }

  set context(context: MutationContext) {
    this._context = context;
  }

  get strictNullChecks(): boolean {
    return this._strictNullChecks;
  }

  set strictNullChecks(strictNullChecks: boolean) {
    this._strictNullChecks = strictNullChecks;
  }

  get lib(): string {
    return `${this.namespace}${this._lib}`;
  }

  set lib(lib: string) {
    this._lib = lib;
  }

  get namespace(): string {
    return this._namespace;
  }

  set namespace(namespace: string) {
    this._namespace = namespace;
  }

}