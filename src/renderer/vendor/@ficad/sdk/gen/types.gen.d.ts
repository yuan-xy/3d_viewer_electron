export type ClientOptions = {
    baseUrl: `${string}://${string}` | (string & {});
};
export type Project = {
    id: string;
    name?: string;
    description?: string;
    time: {
        created: number;
        updated: number;
        initialized?: number;
    };
    ownerId: string;
};
export type EventProjectUpdated = {
    type: "project.updated";
    properties: Project;
};
export type EventServerConnected = {
    type: "server.connected";
    properties: {
        [key: string]: unknown;
    };
};
export type EventGlobalDisposed = {
    type: "global.disposed";
    properties: {
        [key: string]: unknown;
    };
};
export type QuestionOption = {
    /**
     * Display text (1-5 words, concise)
     */
    label: string;
    /**
     * Explanation of choice
     */
    description: string;
};
export type QuestionInfo = {
    /**
     * Complete question
     */
    question: string;
    /**
     * Very short label (max 30 chars)
     */
    header: string;
    /**
     * Available choices
     */
    options: Array<QuestionOption>;
    /**
     * Allow selecting multiple choices
     */
    multiple?: boolean;
    /**
     * Allow typing a custom answer (default: true)
     */
    custom?: boolean;
};
export type QuestionRequest = {
    id: string;
    projectID: string;
    httpSessionId: string;
    /**
     * Questions to ask
     */
    questions: Array<QuestionInfo>;
    tool?: {
        messageID: string;
        callID: string;
    };
};
export type EventQuestionAsked = {
    type: "question.asked";
    properties: QuestionRequest;
};
export type QuestionAnswer = Array<string>;
export type EventQuestionReplied = {
    type: "question.replied";
    properties: {
        projectID: string;
        requestID: string;
        answers: Array<QuestionAnswer>;
    };
};
export type EventQuestionRejected = {
    type: "question.rejected";
    properties: {
        projectID: string;
        requestID: string;
    };
};
export type EventSessionStarted = {
    type: "session.started";
    properties: {
        sessionID: string;
    };
};
export type EventMessageCreated = {
    type: "message.created";
    properties: {
        sessionID: string;
        messageID: string;
        role: string;
        agent: string;
        modelID: string;
    };
};
export type EventSessionError = {
    type: "session.error";
    properties: {
        sessionID?: string;
        error: {
            name: string;
            data: {
                message: string;
                [key: string]: unknown | string;
            };
        };
    };
};
export type EventSessionFinished = {
    type: "session.finished";
    properties: {
        sessionID: string;
    };
};
export type EventMessageTextCreated = {
    type: "message.text.created";
    properties: {
        sessionID: string;
        messageID: string;
        text: string;
    };
};
export type EventToolDone = {
    type: "tool.done";
    properties: {
        sessionID: string;
        tool: string;
        status: "completed" | "error";
        message?: string;
    };
};
export type Event = EventProjectUpdated | EventServerConnected | EventGlobalDisposed | EventQuestionAsked | EventQuestionReplied | EventQuestionRejected | EventSessionStarted | EventMessageCreated | EventSessionError | EventSessionFinished | EventMessageTextCreated | EventToolDone;
export type GlobalEvent = {
    httpSessionId?: string;
    payload: Event;
};
export type BadRequestError = {
    data: unknown;
    errors: Array<{
        [key: string]: unknown;
    }>;
    success: false;
};
export type NotFoundError = {
    name: "NotFoundError";
    data: {
        message: string;
    };
};
export type GlobalHealthData = {
    body?: never;
    path?: never;
    query?: never;
    url: "/global/health";
};
export type GlobalHealthResponses = {
    /**
     * Health information
     */
    200: {
        healthy: true;
        version: string;
    };
};
export type GlobalHealthResponse = GlobalHealthResponses[keyof GlobalHealthResponses];
export type GlobalEventData = {
    body?: never;
    path?: never;
    query?: never;
    url: "/global/event";
};
export type GlobalEventResponses = {
    /**
     * Event stream
     */
    200: GlobalEvent;
};
export type GlobalEventResponse = GlobalEventResponses[keyof GlobalEventResponses];
export type ProjectListData = {
    body?: never;
    path?: never;
    query?: never;
    url: "/projects";
};
export type ProjectListResponses = {
    /**
     * List of projects
     */
    200: Array<Project>;
};
export type ProjectListResponse = ProjectListResponses[keyof ProjectListResponses];
export type ProjectCreateData = {
    body?: {
        /**
         * Project name
         */
        name: string;
        /**
         * Project description
         */
        description?: string;
    };
    path?: never;
    query?: never;
    url: "/projects";
};
export type ProjectCreateErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
};
export type ProjectCreateError = ProjectCreateErrors[keyof ProjectCreateErrors];
export type ProjectCreateResponses = {
    /**
     * Created project
     */
    200: Project;
};
export type ProjectCreateResponse = ProjectCreateResponses[keyof ProjectCreateResponses];
export type ProjectDeleteData = {
    body?: never;
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}";
};
export type ProjectDeleteErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectDeleteError = ProjectDeleteErrors[keyof ProjectDeleteErrors];
export type ProjectDeleteResponses = {
    /**
     * Project deleted
     */
    200: boolean;
};
export type ProjectDeleteResponse = ProjectDeleteResponses[keyof ProjectDeleteResponses];
export type ProjectGetData = {
    body?: never;
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}";
};
export type ProjectGetErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectGetError = ProjectGetErrors[keyof ProjectGetErrors];
export type ProjectGetResponses = {
    /**
     * Project information
     */
    200: Project;
};
export type ProjectGetResponse = ProjectGetResponses[keyof ProjectGetResponses];
export type ProjectUpdateData = {
    body?: {
        name?: string;
        description?: string;
    };
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}";
};
export type ProjectUpdateErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectUpdateError = ProjectUpdateErrors[keyof ProjectUpdateErrors];
export type ProjectUpdateResponses = {
    /**
     * Updated project
     */
    200: Project;
};
export type ProjectUpdateResponse = ProjectUpdateResponses[keyof ProjectUpdateResponses];
export type ProjectListMembersData = {
    body?: never;
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}/members";
};
export type ProjectListMembersErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectListMembersError = ProjectListMembersErrors[keyof ProjectListMembersErrors];
export type ProjectListMembersResponses = {
    /**
     * List of members
     */
    200: Array<{
        projectId: string;
        userId: string;
        role: "admin" | "editor" | "viewer";
        time: {
            created: number;
            updated: number;
        };
    }>;
};
export type ProjectListMembersResponse = ProjectListMembersResponses[keyof ProjectListMembersResponses];
export type ProjectAddMemberData = {
    body?: {
        /**
         * User ID to add
         */
        userId: string;
        /**
         * Role for the new member
         */
        role: "admin" | "editor" | "viewer";
    };
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}/members";
};
export type ProjectAddMemberErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectAddMemberError = ProjectAddMemberErrors[keyof ProjectAddMemberErrors];
export type ProjectAddMemberResponses = {
    /**
     * Member added
     */
    200: {
        projectId: string;
        userId: string;
        role: "admin" | "editor" | "viewer";
        time: {
            created: number;
            updated: number;
        };
    };
};
export type ProjectAddMemberResponse = ProjectAddMemberResponses[keyof ProjectAddMemberResponses];
export type ProjectRemoveMemberData = {
    body?: never;
    path: {
        projectID: string;
        userID: string;
    };
    query?: never;
    url: "/projects/{projectID}/members/{userID}";
};
export type ProjectRemoveMemberErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectRemoveMemberError = ProjectRemoveMemberErrors[keyof ProjectRemoveMemberErrors];
export type ProjectRemoveMemberResponses = {
    /**
     * Member removed
     */
    200: boolean;
};
export type ProjectRemoveMemberResponse = ProjectRemoveMemberResponses[keyof ProjectRemoveMemberResponses];
export type ProjectUploadFileData = {
    body?: never;
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}/file";
};
export type ProjectUploadFileErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
};
export type ProjectUploadFileError = ProjectUploadFileErrors[keyof ProjectUploadFileErrors];
export type ProjectUploadFileResponses = {
    /**
     * File uploaded and committed
     */
    200: {
        id: string;
        parent: string | null;
        author: string;
        message: string;
        glb: string;
        timestamp: string;
    };
};
export type ProjectUploadFileResponse = ProjectUploadFileResponses[keyof ProjectUploadFileResponses];
export type ProjectPromptData = {
    body?: {
        /**
         * Message parts
         */
        parts: Array<unknown>;
        agent?: string;
    };
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}/prompt";
};
export type ProjectPromptErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectPromptError = ProjectPromptErrors[keyof ProjectPromptErrors];
export type ProjectPromptResponses = {
    /**
     * OK
     */
    200: {
        status: "completed" | "error";
        result?: {
            type: "model" | "text";
            glb?: string;
            text?: string;
        };
        error?: string;
    };
};
export type ProjectPromptResponse = ProjectPromptResponses[keyof ProjectPromptResponses];
export type ProjectGetDagData = {
    body?: never;
    path: {
        projectID: string;
    };
    query?: never;
    url: "/projects/{projectID}/dag";
};
export type ProjectGetDagErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectGetDagError = ProjectGetDagErrors[keyof ProjectGetDagErrors];
export type ProjectGetDagResponses = {
    /**
     * Project DAG
     */
    200: {
        schema_version: number;
        id: string;
        name: string | null;
        heads: {
            [key: string]: unknown;
        };
        commits: {
            [key: string]: unknown;
        };
    };
};
export type ProjectGetDagResponse = ProjectGetDagResponses[keyof ProjectGetDagResponses];
export type ProjectListCommitsData = {
    body?: never;
    path: {
        projectID: string;
    };
    query?: {
        branch?: string;
    };
    url: "/projects/{projectID}/commits";
};
export type ProjectListCommitsErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectListCommitsError = ProjectListCommitsErrors[keyof ProjectListCommitsErrors];
export type ProjectListCommitsResponses = {
    /**
     * Commit history
     */
    200: Array<{
        id: string;
        parent: string | null;
        author: string;
        message: string;
        timestamp: string;
    }>;
};
export type ProjectListCommitsResponse = ProjectListCommitsResponses[keyof ProjectListCommitsResponses];
export type ProjectCheckoutData = {
    body?: never;
    path: {
        projectID: string;
    };
    query: {
        commitid: string;
    };
    url: "/projects/{projectID}/checkout";
};
export type ProjectCheckoutErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type ProjectCheckoutError = ProjectCheckoutErrors[keyof ProjectCheckoutErrors];
export type ProjectCheckoutResponses = {
    /**
     * GLB binary model
     */
    200: string;
};
export type ProjectCheckoutResponse = ProjectCheckoutResponses[keyof ProjectCheckoutResponses];
export type TitleGenerateData = {
    body?: {
        message: string;
    };
    path?: never;
    query?: never;
    url: "/title";
};
export type TitleGenerateResponses = {
    /**
     * Generated title
     */
    200: {
        title: string;
    };
};
export type TitleGenerateResponse = TitleGenerateResponses[keyof TitleGenerateResponses];
export type QuestionListData = {
    body?: never;
    path: {
        projectId: string;
    };
    query?: never;
    url: "/question/{projectId}/question";
};
export type QuestionListResponses = {
    /**
     * List of pending questions
     */
    200: Array<QuestionRequest>;
};
export type QuestionListResponse = QuestionListResponses[keyof QuestionListResponses];
export type QuestionReplyData = {
    body?: {
        /**
         * User answers in order of questions (each answer is an array of selected labels)
         */
        answers: Array<QuestionAnswer>;
    };
    path: {
        requestID: string;
    };
    query?: never;
    url: "/question/{requestID}/reply";
};
export type QuestionReplyErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type QuestionReplyError = QuestionReplyErrors[keyof QuestionReplyErrors];
export type QuestionReplyResponses = {
    /**
     * Question answered successfully
     */
    200: boolean;
};
export type QuestionReplyResponse = QuestionReplyResponses[keyof QuestionReplyResponses];
export type QuestionRejectData = {
    body?: never;
    path: {
        requestID: string;
    };
    query?: never;
    url: "/question/{requestID}/reject";
};
export type QuestionRejectErrors = {
    /**
     * Bad request
     */
    400: BadRequestError;
    /**
     * Not found
     */
    404: NotFoundError;
};
export type QuestionRejectError = QuestionRejectErrors[keyof QuestionRejectErrors];
export type QuestionRejectResponses = {
    /**
     * Question rejected successfully
     */
    200: boolean;
};
export type QuestionRejectResponse = QuestionRejectResponses[keyof QuestionRejectResponses];
