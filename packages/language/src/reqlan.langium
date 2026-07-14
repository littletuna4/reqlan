/**
 * Implementation of the rules described in reqlan rq/language/syntax.rq.
 *
 * Design:
 * - Imports and top-level declarations are line-oriented; import/from/as are keywords only there.
 * - One-liner ideas are name + body on a single line; block ideas use braces for rich content.
 * - ReferenceTarget covers local members, import-qualified, alias-qualified, and file targets.
 */
grammar Reqlan

// ---------------------------------------------------------------------------
// file_layout, keywords
// ---------------------------------------------------------------------------

entry Model:
    (NL* imports+=Import)*
    (NL* elements+=TopLevelElement)*
    NL*;

TopLevelElement:
    Idea | IdeaSet | OneLinerIdea;

// ---------------------------------------------------------------------------
// idea_name, one_liner_idea, block_idea, ideaset
// ---------------------------------------------------------------------------

OneLinerIdea:
    name=IdeaName body=OneLinerBody;

OneLinerBody:
    content+=(MarkdownLink | BracketReference | WikiLink | OneLinerText)+;

IdeaDeclaration:
    Idea | OneLinerIdea;

Idea:
    name=IdeaName '{'
        (NL* elements+=BodyElement)*
    NL* '}';

IdeaSet:
    name=IdeaName '(' NL*
        members+=[IdeaDeclaration:IdeaMemberName] (NL* ',' NL* members+=[IdeaDeclaration:IdeaMemberName])*
    NL* ')';

IdeaName returns string:
    ID | STRING;

IdeaMemberName returns string:
    ID | STRING;

ReferenceName returns string:
    ID;

// ---------------------------------------------------------------------------
// block_idea body, reference_embedding, code_snippets
// ---------------------------------------------------------------------------

BodyElement:
    Attribute | MarkdownLink | WikiLink | BracketReference | CodeSnippet | NamedList | NestedList | BodyLine;

BodyLine:
    parts+=RichTextPart+;

RichTextPart:
    MarkdownLink | WikiLink | BracketReference | inlineCode=INLINE_CODE | text=PlainText | punct=PlainPunctuation | lparen='(' | rparen=')';

InlineTextPart:
    MarkdownLink | WikiLink | BracketReference | inlineCode=INLINE_CODE | text=PlainText | punct=PlainPunctuation;

CodeSnippet:
    raw=CODE_FENCE;

// ---------------------------------------------------------------------------
// one-liner body (same line only; ends at newline)
// ---------------------------------------------------------------------------

OneLinerText returns string:
    WORD | ID | NUMBER | INLINE_CODE | OTHER | PlainPunctuation | '(' | ')' | '|' | 'from' | 'import' | 'as' | '`';

PlainText returns string:
    WORD | ID | NUMBER | INLINE_CODE | OTHER | PlainPunctuation | '[' | ']' | '|' | 'from' | 'import' | 'as' | '`';

PlainPunctuation returns string:
    '.' | ',' | ':' | ';' | '!' | '?' | '-';

// ---------------------------------------------------------------------------
// attribute_marker, attribute_forms, attribute_values
// ---------------------------------------------------------------------------

Attribute:
    '@' name=ID (negated?='!')? (':'? value=AttributeValue)?;

AttributeValue:
    BlockValue | ListValue | ScalarValue;

ScalarValue:
    parts+=InlineTextPart+;

BlockValue:
    '{' (NL* elements+=BlockElement)* NL* '}';

BlockElement:
    Attribute | MarkdownLink | WikiLink | BracketReference | CodeSnippet | NamedList | NestedList | BlockLine;

BlockLine:
    parts+=RichTextPart+;

// ---------------------------------------------------------------------------
// lists (comma- or newline-separated one-liners or nameless blocks)
// ---------------------------------------------------------------------------

ListValue:
    '(' NL* items+=ListItem ((NL* ',' NL* | NL+) items+=ListItem)* NL* (',' NL*)? ')';

NamedList:
    label=ID '(' NL+ items+=ListItem ((NL* ',' NL* | NL+) items+=ListItem)* NL* (',' NL*)? ')';

NestedList:
    '(' NL+ items+=ListItem ((NL* ',' NL* | NL+) items+=ListItem)* NL* (',' NL*)? ')';

ListItem:
    OneLinerListItem | AnonymousBlock | NamedBlockListItem | NestedList;

OneLinerListItem:
    body=ListItemBody;

// List item text omits ',' and ')' so separators and the closing paren are not
// swallowed by OneLinerText (which allows both for free-form one-liner ideas).
ListItemBody:
    content+=(MarkdownLink | BracketReference | WikiLink | ListItemText)+;

ListItemText returns string:
    WORD | ID | NUMBER | INLINE_CODE | OTHER | ListItemPunctuation | '(' | '|' | 'from' | 'import' | 'as' | '`';

ListItemPunctuation returns string:
    '.' | ':' | ';' | '!' | '?' | '-';

NamedBlockListItem:
    name=ID '{' (NL* elements+=BodyElement)* NL* '}';

AnonymousBlock:
    '{' (NL* elements+=BodyElement)* NL* '}';

// ---------------------------------------------------------------------------
// markdown_links, reference_wikilink, reference_brackets, reference_qualified, reference_file
// ---------------------------------------------------------------------------

MarkdownLink:
    raw=MARKDOWN_LINK;

WikiLink:
    '[[' target=ReferenceTarget ('|' alias+=AliasPart+)? ']]';

AliasPart:
    text=PlainText | punct=PlainPunctuation;

BracketReference:
    '[' target=ReferenceTarget ']';

ReferenceTarget:
    QualifiedReference | LocalReference | FileSymbolReference | FileReference;

FileReference:
    file=STRING;

FileSymbolReference:
    file=STRING '.' symbols+=ID ('.' symbols+=ID)*;

QualifiedReference:
    (path=[Import:STRING] | qualifier=[Import:ID]) '.'
    (ideaset=[IdeaSet:ReferenceName] '.')? idea=[IdeaDeclaration:ReferenceName];

LocalReference:
    ideaset=[IdeaSet:ReferenceName] '.' idea=[IdeaDeclaration:ReferenceName]
    | idea=[IdeaDeclaration:ReferenceName] '.' attribute=ID
    | idea=[IdeaDeclaration:ReferenceName]
    | ideaset=[IdeaSet:ReferenceName];

// ---------------------------------------------------------------------------
// import_from, import_namespace, import_qualified
// ---------------------------------------------------------------------------

Import:
    FromImport | NamespaceImport | QualifiedImport;

FromImport:
    'from' path=STRING 'import' specifiers+=FromImportSpecifier (',' specifiers+=FromImportSpecifier)*;

FromImportSpecifier:
    idea=[IdeaDeclaration:ID] ('as' alias=ID)?;

NamespaceImport:
    'import' path=STRING ('as' alias=ID)?;

QualifiedImport:
    'import' path=STRING '.' ideaset=ID '.' idea=[IdeaDeclaration:ID] ('as' alias=ID)?;

// ---------------------------------------------------------------------------
// comments, string_literals
// ---------------------------------------------------------------------------

terminal NL: /\r?\n/;
hidden terminal WS: /[ \t]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

terminal MARKDOWN_LINK: /\[(?!\[)[^\]]+\]\([^)]+\)/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\\r\n])*"|'(\\.|[^'\\\r\n])*'/;
terminal NUMBER: /\d+/;
terminal WORD: /[A-Za-z_][\w']*/;
terminal OTHER: /[^\s\w\[\]()`]/;
terminal INLINE_CODE: /`[^`\n]+`/;
terminal CODE_FENCE: /```[^\n]*(?:\r?\n[\s\S]*?)?```/;
