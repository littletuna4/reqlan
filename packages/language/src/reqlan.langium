/**
 * Reqlan surface syntax for requirement documents.
 * Interacts with the requirement graph model: ideas, ideasets, imports, and references.
 */
grammar Reqlan

entry Model:
    imports+=Import*
    elements+=TopLevelElement*;

TopLevelElement:
    Idea | IdeaSet | SimpleIdea;

Idea:
    name=IdeaName '{'
        elements+=BodyElement*
    '}';

SimpleIdea:
    name=IdeaName tokens+=SimpleIdeaToken+;

IdeaSet:
    name=ID '('
        members+=[Idea:IdeaMemberName] (',' members+=[Idea:IdeaMemberName])*
    ')';

IdeaMemberName returns string:
    ID | STRING;

IdeaName returns string:
    ID | STRING;

BodyElement:
    WikiLink | BracketReference | Attribute | BodyLine;

BodyLine:
    parts+=InlinePart+;

InlinePart:
    WikiLink | BracketReference | text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

BodyPunctuation returns string:
    '.' | ',' | ':' | ';' | '!' | '?' | '-';

Attribute:
    '@' name=ID (negated?='!')? (':' value=AttributeValue)?;

AttributeValue:
    BlockValue | ListValue | ScalarValue;

BlockValue:
    '{' elements+=BlockElement* '}';

BlockElement:
    WikiLink | BracketReference | Attribute | NamedList | NestedList | BlockLine;

BlockLine:
    parts+=InlinePart+;

NamedList:
    label=ID '('
        items+=ListItem (',' items+=ListItem)*
    ')';

NestedList:
    '(' items+=ListItem (',' items+=ListItem)* ')';

ListValue:
    '(' items+=ListItem (',' items+=ListItem)* ')';

ListItem:
    WikiLink | BracketReference | tokens+=ListItemToken+;

ListItemToken:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

ScalarValue:
    tokens+=ScalarToken+;

ScalarToken:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

WikiLink:
    '[[' target=ReferenceTarget ('|' alias+=AliasPart+)? ']]';

AliasPart:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

BracketReference:
    '[' target=ReferenceTarget ']';

ReferenceTarget:
    path=STRING '.' idea=[Idea:ID]
    | idea=[Idea:ID]
    | qualifier=ID '.' idea=[Idea:ID];

Import:
    FromImport | NamespaceImport | QualifiedImport;

FromImport:
    'from' path=STRING 'import' idea=[Idea:ID] ('as' alias=ID)?;

NamespaceImport:
    'import' path=STRING ('as' alias=ID)?;

QualifiedImport:
    'import' path=STRING '.' ideaset=ID '.' idea=[Idea:ID] ('as' alias=ID)?;

SimpleIdeaToken:
    text=TextToken | punct=BodyPunctuation | other=PUNCTUATION;

TextToken returns string:
    ID | WORD;

hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
terminal WORD: /[A-Za-z_][\w']*/;
terminal PUNCTUATION: /[^\s\w\{(\@"\[\]]+/;
