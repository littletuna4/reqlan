/**
 * Embedded reqlan references in line comments of arbitrary source files.
 * Syntax: rq:"./reqfile.rq".idea_name
 */
grammar ReqlanComment

entry CommentModel:
    references+=CommentReference*;

CommentReference:
    'rq' ':' path=STRING '.' idea=ID;

terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
