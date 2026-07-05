/**
 * Embedded reqlan references in comments of arbitrary source files.
 * Syntax: rq:[idea] or rq:["./reqfile.rq".idea_name]
 */
grammar ReqlanComment

entry CommentModel:
    references+=CommentReference*;

CommentReference:
    'rq' ':' '[' target=CommentReferenceTarget ']';

CommentReferenceTarget:
    QualifiedCommentReference | LocalCommentReference;

QualifiedCommentReference:
    path=STRING '.' idea=ID;

LocalCommentReference:
    idea=ID;

terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"/;
