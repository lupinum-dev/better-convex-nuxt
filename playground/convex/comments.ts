import { scopedMutation, scopedQuery } from "./functions";
import {
  createComment,
  deleteComment,
  listCommentsByPost,
  updateComment,
} from "../shared/schemas/comment";

export const listByPost = scopedQuery({
  args: listCommentsByPost.validators,
  handler: async ({ db }, args) => {
    const post = await db.get(args.postId);
    if (!post) return [];

    return await db
      .query("comments")
      .filter((q) => q.eq(q.field("postId"), args.postId))
      .order("desc")
      .collect();
  },
});

export const create = scopedMutation({
  args: createComment.validators,
  require: "comment.create",
  resource: (args) => ({ table: "posts", id: args.postId }),
  handler: async ({ db, actor }, args) => {
    return await db.insert("comments", {
      postId: args.postId,
      content: args.content,
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const update = scopedMutation({
  args: updateComment.validators,
  require: "comment.update",
  resource: (args) => args.id,
  handler: async ({ db }, args) => {
    await db.patch(args.id, {
      content: args.content,
      editedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = scopedMutation({
  args: deleteComment.validators,
  require: "comment.delete",
  resource: (args) => args.id,
  handler: async ({ db }, args) => {
    await db.delete(args.id);
  },
});
