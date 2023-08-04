import { parse, type ParseOptions, type AST } from '@handlebars/parser';
import { SourceNode } from 'source-map/lib/source-node.js';

type Statement =
    | AST.MustacheStatement
    | AST.BlockStatement
    | AST.PartialStatement
    | AST.PartialBlockStatement
    | AST.ContentStatement
    | AST.CommentStatement;

type Literal =
    | AST.StringLiteral
    | AST.BooleanLiteral
    | AST.NumberLiteral
    | AST.UndefinedLiteral
    | AST.NullLiteral;

type Expression = AST.SubExpression | AST.PathExpression | Literal;

type CompileOptions = ParseOptions & {
    inputVar?: string;
    dataVar?: string;
    functionName?: string;
    omitComments?: boolean;
    format?: 'esm' | 'cjs';
};

type CompileContext = CompileOptions & {
    depth: number;
    imports: Map<string, string>;
};

function compileProgram(ast: AST.Program, ctx: CompileContext): SourceNode {
    const sourceNode = new SourceNode(
        ast.loc?.start?.line,
        ast.loc?.start?.column,
        ctx.srcName ?? null
    );
    sourceNode.add('""');
    if (ast.body && ast.body.length > 0) {
        for (let i = 0; i < ast.body.length; i++) {
            sourceNode.add(' + ');
            sourceNode.add(compileStatement(ast.body[i] as Statement, ctx));
        }
    }
    return sourceNode;
}

function compileStatement(ast: Statement, ctx: CompileContext): SourceNode {
    switch (ast.type) {
        case 'ContentStatement': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                JSON.stringify(ast.value)
            );
        }
        case 'CommentStatement': {
            if (ctx?.omitComments) {
                return new SourceNode();
            }
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                `""/* ${ast.value.replace(/\*\//g, '')} */`
            );
        }
        case 'MustacheStatement': {
            const sourceNode: SourceNode = new SourceNode();
            if (ast.params.length > 0) {
                sourceNode.add(compileFunctionCall(ast, ctx));
            } else {
                sourceNode.add(compileExpression(ast.path as Expression, ctx));
            }
            if (ast.escaped) {
                sourceNode.prepend('e(');
                sourceNode.add(')');
                ctx.imports.set('e', '@eslym/tinybars/runtime');
            }
            return sourceNode;
        }
        case 'BlockStatement': {
            switch (ast.path.original) {
                case 'if':
                case 'unless': {
                    const sourceNode: SourceNode = new SourceNode(
                        ast.loc.start.line,
                        ast.loc.start.column,
                        ctx.srcName ?? null
                    );
                    const condition = compileExpression(ast.params[0] as Expression, ctx);
                    const positive = compileProgram(ast.program, ctx);
                    const negative = ast.inverse ? compileProgram(ast.inverse, ctx) : '""';
                    const left = ast.path.original === 'if' ? positive : negative;
                    const right = ast.path.original === 'if' ? negative : positive;
                    sourceNode.add('(');
                    sourceNode.add(condition);
                    sourceNode.add(' ? ');
                    sourceNode.add(left);
                    sourceNode.add(' : ');
                    sourceNode.add(right);
                    sourceNode.add(')');
                    return sourceNode;
                }
                case 'each': {
                    const sourceNode: SourceNode = new SourceNode(
                        ast.loc.start.line,
                        ast.loc.start.column,
                        ctx.srcName ?? null
                    );
                    const src = compileExpression(ast.params[0] as Expression, ctx);
                    sourceNode.add('Object.entries(');
                    sourceNode.add(src);
                    sourceNode.add(`).map(([key${ctx.depth}, val${ctx.depth}]) => (`);
                    sourceNode.add(
                        compileProgram(ast.program, {
                            ...ctx,
                            depth: ctx.depth + 1,
                            inputVar: `val${ctx.depth}`
                        })
                    );
                    sourceNode.add(')).join("")');
                    return sourceNode;
                }
                case 'with': {
                    const sourceNode: SourceNode = new SourceNode(
                        ast.loc.start.line,
                        ast.loc.start.column,
                        ctx.srcName ?? null
                    );
                    sourceNode.add('((val)=> (');
                    sourceNode.add(
                        compileProgram(ast.program, {
                            ...ctx,
                            inputVar: 'val'
                        })
                    );
                    sourceNode.add('))(');
                    sourceNode.add(compileExpression(ast.params[0] as Expression, ctx));
                    sourceNode.add(')');
                    return sourceNode;
                }
                default: {
                    throw new Error(
                        `Unexpected ${ast.path.original} at ${ast.loc.start.line}:${ast.loc.start.column}`
                    );
                }
            }
        }
        default:
            throw new Error(
                `Unexpected ${ast.type} at ${ast.loc.start.line}:${ast.loc.start.column}`
            );
    }
}

function compileExpression(ast: Expression, ctx: CompileContext): SourceNode {
    switch (ast.type) {
        case 'PathExpression': {
            const sourceNode: SourceNode = new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null
            );
            if (ast.data) {
                switch (ast.head) {
                    case 'root': {
                        sourceNode.add('root');
                        break;
                    }
                    case 'this': {
                        sourceNode.add(ctx.inputVar!);
                        break;
                    }
                    case 'key':
                    case 'index': {
                        if (ctx.depth === 0) {
                            throw new Error(
                                `Unexpected ${ast.original} at ${ast.loc.start.line}:${ast.loc.start.column}`
                            );
                        }
                        sourceNode.add(`key${ctx.depth - 1}`);
                        break;
                    }
                    default: {
                        sourceNode.add(ctx.dataVar!);
                        break;
                    }
                }
            } else {
                sourceNode.add(ctx.inputVar!);
            }
            sourceNode.add(
                ast.parts
                    .map((part) => [
                        '[',
                        typeof part === 'string'
                            ? JSON.stringify(part)
                            : compileExpression(part, ctx),
                        ']'
                    ])
                    .flat()
            );
            return sourceNode;
        }
        case 'StringLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                JSON.stringify(ast.value)
            );
        }
        case 'BooleanLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                ast.value ? 'true' : 'false'
            );
        }
        case 'NumberLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                ast.value.toString()
            );
        }
        case 'UndefinedLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                'undefined'
            );
        }
        case 'NullLiteral': {
            return new SourceNode(
                ast.loc.start.line,
                ast.loc.start.column,
                ctx.srcName ?? null,
                'null'
            );
        }
        default: {
            throw new Error(
                `Unexpected ${ast.type} at ${ast.loc.start.line}:${ast.loc.start.column}`
            );
        }
    }
}

function compileFunctionCall(ast: AST.MustacheStatement, ctx: CompileContext): SourceNode {
    const sourceNode: SourceNode = new SourceNode(
        ast.loc.start.line,
        ast.loc.start.column,
        ctx?.srcName ?? null
    );
    sourceNode.add(compileExpression(ast.path as Expression, ctx));
    sourceNode.add('(');
    for (let i = 0; i < ast.params.length; i++) {
        sourceNode.add(compileExpression(ast.params[i] as Expression, ctx));
        if (i < ast.params.length - 1) {
            sourceNode.add(', ');
        }
    }
    sourceNode.add(')');
    return sourceNode;
}

export function compile(
    str: string,
    options?: CompileOptions
): { code: string; sourceMap: string } {
    const ctx: CompileContext = {
        inputVar: '$t',
        dataVar: '$c',
        format: 'esm',
        ...(options ?? {}),
        depth: 0,
        imports: new Map()
    };
    const ast: AST.Program = parse(str, options);
    const sourceNode: SourceNode = new SourceNode();
    sourceNode.add(
        ctx.format === 'esm' ? 'export default function ' : 'module.exports = function '
    );
    if (ctx.functionName) {
        sourceNode.add(ctx.functionName);
    }
    sourceNode.add(`(${ctx.inputVar}, ${ctx.dataVar} = {}){\n`);
    sourceNode.add(`    const root = ${ctx.inputVar};\n`);
    sourceNode.add(`    return `);
    sourceNode.add(compileProgram(ast, ctx));
    sourceNode.add(';\n}');
    for (const [v, from] of ctx.imports) {
        if (ctx.format === 'esm') {
            sourceNode.prepend(`import ${v} from ${JSON.stringify(from)};\n`);
        } else {
            sourceNode.prepend(`const ${v} = require(${JSON.stringify(from)});\n`);
        }
    }
    const res = sourceNode.toStringWithSourceMap({
        file: options?.srcName
    });
    return {
        code: res.code,
        sourceMap: res.map.toString()
    };
}
