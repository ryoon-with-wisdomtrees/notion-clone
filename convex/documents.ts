import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
// Mutations insert, update and remove data from the database,
// check authentication or perform other business logic,
// and optionally return a response to the client application.
//CRUD 정의하는 파일. 도큐먼트 스키마에 대하여. 이아이가 convex서버에서의 api

//삭제
export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    //function: 아카이빙하고 또 하고 또하고 또하는 펑션 제일 마지막 후손까지
    const recursiveArchivFunction = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId)
        )
        .collect();
      // ForEach&Map에서는 promise await를 사용할 수 없어. 그래서 그냥 for loop쓸거임.
      for (const child of children) {
        await ctx.db.patch(child._id, { isArchived: true });
        //child의 child까지도! 남김없이 제일 마지막 후손까지.
        await recursiveArchivFunction(child._id);
      }
    };

    //.1 인증된 유저인지확인
    const identity = await ctx.auth.getUserIdentity();
    /**
     * Get details about the currently authenticated user.
     * @returns
     * A promise that resolves to a UserIdentity
     * if the Convex client was configured with a valid ID token and null otherwise.
     */
    if (!identity) {
      throw new Error("Not authenticated.");
    }
    const userId = identity.subject;

    //2. id값으로 도큐먼트 가져오기
    /**Identifier for the end-user from the identity provider,
     *  not necessarily unique across different providers. */
    const existingDoc = await ctx.db.get(args.id);
    if (!existingDoc) {
      throw new Error("Not Found.");
    }

    //3. existingDoc의 User와 인증된 User가 같은지(matching)인지 확인
    if (existingDoc.userId !== userId) {
      throw new Error("Unauthorized"); // 같아야지만 수정가능하게.
    }

    //4. 아카이빙 작업 시작(w/recursiveArchivFunction)
    /**
     * Patch an existing document, shallow merging it with the given partial document.
     * New fields are added. Existing fields are overwritten. Fields set to undefined are removed.
     * @param id — The values.GenericId of the document to patch.
     * @param value
     * The partial GenericDocument to merge into the specified document. If this new value specifies system fields like _id, they must match the document's existing field values.
     *
     */
    const document = await ctx.db.patch(args.id, {
      isArchived: true,
    });
    recursiveArchivFunction(args.id);

    return document;
  },
});

// 전체 도큐 리스트 (조건적용)
export const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user_parent", (query) =>
        query.eq("userId", userId).eq("parentDocument", args.parentDocument)
      )
      .filter((query) => query.eq(query.field("isArchived"), false)) //삭제된 도큐먼트는 제외&아카이브된 것만
      .order("desc")
      .collect();

    return documents;
  },
});

// 전체 도큐 리스트 (조건없음)
export const getNote = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity(); //convex서버에서 제공하는 함수
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const documents = await ctx.db.query("documents").collect();
    return documents;
  },
});
// 노션작성 로직
export const create = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    //컨텍스트와 아규먼트
    //일단 현재 로그인한 유저 Fetch
    const identity = await ctx.auth.getUserIdentity(); //convex서버에서 제공하는 함수
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // 유저있으면, db에 insert
    const userId = identity.subject;
    const document = await ctx.db.insert("documents", {
      title: args.title,
      parentDocument: args.parentDocument,
      userId,
      isArchived: false,
      isPublished: false,
    });
    return document;
  },
});
