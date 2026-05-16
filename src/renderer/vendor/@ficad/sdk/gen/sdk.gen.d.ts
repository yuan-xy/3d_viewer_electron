import { type Client, type Options as Options2, type TDataShape } from "./client/index.js";
import type { GlobalEventResponses, GlobalHealthResponses, ProjectAddMemberErrors, ProjectAddMemberResponses, ProjectCheckoutErrors, ProjectCheckoutResponses, ProjectCreateErrors, ProjectCreateResponses, ProjectDeleteErrors, ProjectDeleteResponses, ProjectGetDagErrors, ProjectGetDagResponses, ProjectGetErrors, ProjectGetResponses, ProjectListCommitsErrors, ProjectListCommitsResponses, ProjectListMembersErrors, ProjectListMembersResponses, ProjectListResponses, ProjectPromptErrors, ProjectPromptResponses, ProjectRemoveMemberErrors, ProjectRemoveMemberResponses, ProjectUpdateErrors, ProjectUpdateResponses, ProjectUploadFileErrors, ProjectUploadFileResponses, QuestionAnswer, QuestionListResponses, QuestionRejectErrors, QuestionRejectResponses, QuestionReplyErrors, QuestionReplyResponses, TitleGenerateResponses } from "./types.gen.js";
export type Options<TData extends TDataShape = TDataShape, ThrowOnError extends boolean = boolean> = Options2<TData, ThrowOnError> & {
    /**
     * You can provide a client instance returned by `createClient()` instead of
     * individual options. This might be also useful if you want to implement a
     * custom client.
     */
    client?: Client;
    /**
     * You can pass arbitrary values through the `meta` object. This can be
     * used to access values that aren't defined as part of the SDK function.
     */
    meta?: Record<string, unknown>;
};
declare class HeyApiClient {
    protected client: Client;
    constructor(args?: {
        client?: Client;
    });
}
declare class HeyApiRegistry<T> {
    private readonly defaultKey;
    private readonly instances;
    get(key?: string): T;
    set(value: T, key?: string): void;
}
export declare class Global extends HeyApiClient {
    /**
     * Get health
     *
     * Get health information about the FiCAD server.
     */
    health<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<GlobalHealthResponses, unknown, ThrowOnError, "fields">;
    /**
     * Get global events
     *
     * Subscribe to global events from the FiCAD system using server-sent events.
     */
    event<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): Promise<import("./core/serverSentEvents.gen.js").ServerSentEventsResult<GlobalEventResponses, unknown>>;
}
export declare class Project extends HeyApiClient {
    /**
     * List projects
     *
     * List all projects the current user has access to.
     */
    list<ThrowOnError extends boolean = false>(options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Create project
     *
     * Create a new project. The current user becomes the owner.
     */
    create<ThrowOnError extends boolean = false>(parameters?: {
        name?: string;
        description?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectCreateResponses, ProjectCreateErrors, ThrowOnError, "fields">;
    /**
     * Delete project
     *
     * Delete a project. Only the owner can delete.
     */
    delete<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectDeleteResponses, ProjectDeleteErrors, ThrowOnError, "fields">;
    /**
     * Get project
     *
     * Get a specific project by ID. The current user must be a member.
     */
    get<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectGetResponses, ProjectGetErrors, ThrowOnError, "fields">;
    /**
     * Update project
     *
     * Update project properties. Only the owner or admin can update.
     */
    update<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        name?: string;
        description?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectUpdateResponses, ProjectUpdateErrors, ThrowOnError, "fields">;
    /**
     * List project members
     *
     * List all members of a project.
     */
    listMembers<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectListMembersResponses, ProjectListMembersErrors, ThrowOnError, "fields">;
    /**
     * Add project member
     *
     * Add a member to the project. Only the owner or admin can add members.
     */
    addMember<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        userId?: string;
        role?: "admin" | "editor" | "viewer";
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectAddMemberResponses, ProjectAddMemberErrors, ThrowOnError, "fields">;
    /**
     * Remove project member
     *
     * Remove a member from the project. Only the owner or admin can remove members. Cannot remove the owner.
     */
    removeMember<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        userID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectRemoveMemberResponses, ProjectRemoveMemberErrors, ThrowOnError, "fields">;
    /**
     * Upload 3D model file
     *
     * Upload a 3D model file (STL, GLB, GLTF, 3MF, STP, STEP) up to 100MB. File content is validated against its extension and auto-converted to GLB.
     */
    uploadFile<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectUploadFileResponses, ProjectUploadFileErrors, ThrowOnError, "fields">;
    /**
     * Send prompt
     *
     * Send a prompt to a project, streaming the AI response.
     */
    prompt<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        parts?: Array<unknown>;
        agent?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectPromptResponses, ProjectPromptErrors, ThrowOnError, "fields">;
    /**
     * Get project DAG
     *
     * Get the full DAG (Directed Acyclic Graph) of the project repository.
     */
    getDag<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectGetDagResponses, ProjectGetDagErrors, ThrowOnError, "fields">;
    /**
     * List commits
     *
     * Return linear commit history for a branch, newest first. Defaults to 'main'.
     */
    listCommits<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        branch?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectListCommitsResponses, ProjectListCommitsErrors, ThrowOnError, "fields">;
    /**
     * Checkout commit and build model
     *
     * Checkout a specific commit in the user's worktree, run the Python build pipeline, and return the generated GLB file.
     */
    checkout<ThrowOnError extends boolean = false>(parameters: {
        projectID: string;
        commitid: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<ProjectCheckoutResponses, ProjectCheckoutErrors, ThrowOnError, "fields">;
}
export declare class Title extends HeyApiClient {
    /**
     * Generate title for message
     *
     * Generate a title for the given message using the title agent
     */
    generate<ThrowOnError extends boolean = false>(parameters?: {
        message?: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<TitleGenerateResponses, unknown, ThrowOnError, "fields">;
}
export declare class Question extends HeyApiClient {
    /**
     * List pending questions
     *
     * Get all pending question requests for a project.
     */
    list<ThrowOnError extends boolean = false>(parameters: {
        projectId: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<QuestionListResponses, unknown, ThrowOnError, "fields">;
    /**
     * Reply to question request
     *
     * Provide answers to a question request from the AI assistant.
     */
    reply<ThrowOnError extends boolean = false>(parameters: {
        requestID: string;
        answers?: Array<QuestionAnswer>;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<QuestionReplyResponses, QuestionReplyErrors, ThrowOnError, "fields">;
    /**
     * Reject question request
     *
     * Reject a question request from the AI assistant.
     */
    reject<ThrowOnError extends boolean = false>(parameters: {
        requestID: string;
    }, options?: Options<never, ThrowOnError>): import("./client/types.gen.js").RequestResult<QuestionRejectResponses, QuestionRejectErrors, ThrowOnError, "fields">;
}
export declare class FicadClient extends HeyApiClient {
    static readonly __registry: HeyApiRegistry<FicadClient>;
    constructor(args?: {
        client?: Client;
        key?: string;
    });
    private _global?;
    get global(): Global;
    private _project?;
    get project(): Project;
    private _title?;
    get title(): Title;
    private _question?;
    get question(): Question;
}
export {};
