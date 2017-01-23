import * as ts from 'typescript';
import { Visitor, VisitorContext } from 'tspoon';

export const TypeParameterVisitor: Visitor = {
  filter: function filter(node: ts.Node) {
    return node.kind === ts.SyntaxKind.VariableDeclaration;
  },
  visit: function visit(node: ts.VariableDeclaration, context: VisitorContext) {
    console.log(node.getChildren());
  },
};
