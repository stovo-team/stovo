# Data Models & Entities

<!-- okf:generated:start -->
Distilled domain structures, entities, and database model contracts.

```mermaid
erDiagram
  LoadClient {
    string ID
    string TargetURL
    string Username
    string AccessToken
    string UserID
    *websocket.Conn wsConn
  }
  MetricRecorder {
    string name
    sync.Mutex mu
    []time.Duration samples
    int64 success
    int64 failure
  }
  StatsSummary {
    string Name
    int64 TotalOps
    int64 SuccessOps
    int64 FailedOps
    float64 RatePerSec
    time.Duration Min
  }
  InstancePrincipalReader {
    string secretOCID
    *http.Client client
  }
  CallParticipant {
    `json:"-"` config
    string ID
    string UserID
    string Role
    string State
    *time.Time JoinedAt
  }
  CallParticipantCreate {
    *CallParticipantMutation mutation
    []Hook hooks
    []sql.ConflictOption conflict
  }
  CallParticipantCreateBulk {
    error err
    []*CallParticipantCreate builders
    []sql.ConflictOption conflict
  }
  CallParticipantUpsertBulk {
    *CallParticipantCreateBulk create
  }
  CallParticipantDelete {
    []Hook hooks
    *CallParticipantMutation mutation
  }
  CallParticipantDeleteOne {
    *CallParticipantDelete _d
  }
  CallParticipantQuery {
    *QueryContext ctx
    []callparticipant.OrderOption order
    []Interceptor inters
    []predicate.CallParticipant predicates
    *sql.Selector sql
    func(context.Context) path
  }
  CallParticipantGroupBy {
    *CallParticipantQuery build
  }
  CallParticipantUpdate {
    []Hook hooks
    *CallParticipantMutation mutation
  }
  CallParticipantUpdateOne {
    []string fields
    []Hook hooks
    *CallParticipantMutation mutation
  }
  CallSession {
    `json:"-"` config
    string ID
    string CallerID
    string CalleeID
    string CallType
    string State
  }
  CallSessionEdges {
    *User Caller
    *User Callee
    *Chat Chat
    [3]bool loadedTypes
  }
  CallSessionCreate {
    *CallSessionMutation mutation
    []Hook hooks
    []sql.ConflictOption conflict
  }
  CallSessionCreateBulk {
    error err
    []*CallSessionCreate builders
    []sql.ConflictOption conflict
  }
  CallSessionUpsertBulk {
    *CallSessionCreateBulk create
  }
  CallSessionDelete {
    []Hook hooks
    *CallSessionMutation mutation
  }
  CallSessionDeleteOne {
    *CallSessionDelete _d
  }
  CallSessionQuery {
    *QueryContext ctx
    []callsession.OrderOption order
    []Interceptor inters
    []predicate.CallSession predicates
    *UserQuery withCaller
    *UserQuery withCallee
  }
  CallSessionGroupBy {
    *CallSessionQuery build
  }
  CallSessionUpdate {
    []Hook hooks
    *CallSessionMutation mutation
  }
  CallSessionUpdateOne {
    []string fields
    []Hook hooks
    *CallSessionMutation mutation
  }
```

## Model Catalog

### `LoadClient`
_Source: `backend/cmd/loadtest/client.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `TargetURL` | `string` |
| `Username` | `string` |
| `AccessToken` | `string` |
| `UserID` | `string` |
| `wsConn` | `*websocket.Conn` |
| `wsLock` | `sync.Mutex` |
| `closed` | `atomic.Bool` |
| `ackID` | `atomic.Int64` |
| `ackWait` | `sync.Map` |
| `OnMessageReceived` | `func(msgID,` |
| `OnPongReceived` | `func(rtt` |
| `httpClient` | `*http.Client` |

### `MetricRecorder`
_Source: `backend/cmd/loadtest/metrics.go`_

| Field | Type |
| :--- | :--- |
| `name` | `string` |
| `mu` | `sync.Mutex` |
| `samples` | `[]time.Duration` |
| `success` | `int64` |
| `failure` | `int64` |

### `StatsSummary`
_Source: `backend/cmd/loadtest/metrics.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `TotalOps` | `int64` |
| `SuccessOps` | `int64` |
| `FailedOps` | `int64` |
| `RatePerSec` | `float64` |
| `Min` | `time.Duration` |
| `Mean` | `time.Duration` |
| `MedianP50` | `time.Duration` |
| `P90` | `time.Duration` |
| `P95` | `time.Duration` |
| `P99` | `time.Duration` |
| `Max` | `time.Duration` |

### `InstancePrincipalReader`
_Source: `backend/cmd/oci-secret-adapter/main.go`_

| Field | Type |
| :--- | :--- |
| `secretOCID` | `string` |
| `client` | `*http.Client` |

### `CallParticipant`
_Source: `backend/ent/callparticipant.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `Role` | `string` |
| `State` | `string` |
| `JoinedAt` | `*time.Time` |
| `selectValues` | `sql.SelectValues` |

### `CallParticipantCreate`
_Source: `backend/ent/callparticipant_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*CallParticipantMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `CallParticipantCreateBulk`
_Source: `backend/ent/callparticipant_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*CallParticipantCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `CallParticipantUpsertBulk`
_Source: `backend/ent/callparticipant_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*CallParticipantCreateBulk` |

### `CallParticipantDelete`
_Source: `backend/ent/callparticipant_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*CallParticipantMutation` |

### `CallParticipantDeleteOne`
_Source: `backend/ent/callparticipant_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*CallParticipantDelete` |

### `CallParticipantQuery`
_Source: `backend/ent/callparticipant_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]callparticipant.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.CallParticipant` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `CallParticipantGroupBy`
_Source: `backend/ent/callparticipant_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*CallParticipantQuery` |

### `CallParticipantUpdate`
_Source: `backend/ent/callparticipant_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*CallParticipantMutation` |

### `CallParticipantUpdateOne`
_Source: `backend/ent/callparticipant_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*CallParticipantMutation` |

### `CallSession`
_Source: `backend/ent/callsession.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `CallerID` | `string` |
| `CalleeID` | `string` |
| `CallType` | `string` |
| `State` | `string` |
| `CreatedAt` | `time.Time` |
| `EndedAt` | `*time.Time` |
| `DurationS` | `*int` |
| `ChatID` | `*string` |
| `Topology` | `string` |
| `Edges` | `CallSessionEdges` |
| `selectValues` | `sql.SelectValues` |

### `CallSessionEdges`
_Source: `backend/ent/callsession.go`_

| Field | Type |
| :--- | :--- |
| `Caller` | `*User` |
| `Callee` | `*User` |
| `Chat` | `*Chat` |
| `loadedTypes` | `[3]bool` |

### `CallSessionCreate`
_Source: `backend/ent/callsession_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*CallSessionMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `CallSessionCreateBulk`
_Source: `backend/ent/callsession_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*CallSessionCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `CallSessionUpsertBulk`
_Source: `backend/ent/callsession_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*CallSessionCreateBulk` |

### `CallSessionDelete`
_Source: `backend/ent/callsession_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*CallSessionMutation` |

### `CallSessionDeleteOne`
_Source: `backend/ent/callsession_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*CallSessionDelete` |

### `CallSessionQuery`
_Source: `backend/ent/callsession_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]callsession.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.CallSession` |
| `withCaller` | `*UserQuery` |
| `withCallee` | `*UserQuery` |
| `withChat` | `*ChatQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `CallSessionGroupBy`
_Source: `backend/ent/callsession_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*CallSessionQuery` |

### `CallSessionUpdate`
_Source: `backend/ent/callsession_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*CallSessionMutation` |

### `CallSessionUpdateOne`
_Source: `backend/ent/callsession_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*CallSessionMutation` |

### `Chat`
_Source: `backend/ent/chat.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Type` | `string` |
| `Title` | `*string` |
| `Description` | `*string` |
| `CreatedBy` | `*string` |
| `ChatPhotoFileID` | `*string` |
| `ChatAvatarMode` | `*string` |
| `ChatAvatarSymbolID` | `*string` |
| `ChatAvatarColorID` | `*string` |
| `MediaVisibility` | `string` |
| `CommentsEnabled` | `bool` |
| `EncryptionProtocol` | `string` |
| `CreatedAt` | `string` |
| `UpdatedAt` | `string` |
| `PinPermission` | `string` |
| `MessageDelaySeconds` | `int` |
| `Edges` | `ChatEdges` |
| `selectValues` | `sql.SelectValues` |

### `ChatEdges`
_Source: `backend/ent/chat.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `Creator` | `*User` |
| `Files` | `[]*File` |
| `Messages` | `[]*Message` |
| `CallSessions` | `[]*CallSession` |
| `PlansSourced` | `[]*Plan` |
| `loadedTypes` | `[6]bool` |

### `ChatCreate`
_Source: `backend/ent/chat_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*ChatMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatCreateBulk`
_Source: `backend/ent/chat_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*ChatCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatUpsertBulk`
_Source: `backend/ent/chat_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*ChatCreateBulk` |

### `ChatDelete`
_Source: `backend/ent/chat_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMutation` |

### `ChatDeleteOne`
_Source: `backend/ent/chat_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*ChatDelete` |

### `ChatQuery`
_Source: `backend/ent/chat_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]chat.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.Chat` |
| `withFamily` | `*FamilyQuery` |
| `withCreator` | `*UserQuery` |
| `withFiles` | `*FileQuery` |
| `withMessages` | `*MessageQuery` |
| `withCallSessions` | `*CallSessionQuery` |
| `withPlansSourced` | `*PlanQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `ChatGroupBy`
_Source: `backend/ent/chat_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*ChatQuery` |

### `ChatUpdate`
_Source: `backend/ent/chat_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMutation` |

### `ChatUpdateOne`
_Source: `backend/ent/chat_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMutation` |

### `ChatMediaApproval`
_Source: `backend/ent/chatmediaapproval.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `CreatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `ChatMediaApprovalCreate`
_Source: `backend/ent/chatmediaapproval_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*ChatMediaApprovalMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatMediaApprovalCreateBulk`
_Source: `backend/ent/chatmediaapproval_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*ChatMediaApprovalCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatMediaApprovalUpsertBulk`
_Source: `backend/ent/chatmediaapproval_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*ChatMediaApprovalCreateBulk` |

### `ChatMediaApprovalDelete`
_Source: `backend/ent/chatmediaapproval_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMediaApprovalMutation` |

### `ChatMediaApprovalDeleteOne`
_Source: `backend/ent/chatmediaapproval_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*ChatMediaApprovalDelete` |

### `ChatMediaApprovalQuery`
_Source: `backend/ent/chatmediaapproval_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]chatmediaapproval.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.ChatMediaApproval` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `ChatMediaApprovalGroupBy`
_Source: `backend/ent/chatmediaapproval_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*ChatMediaApprovalQuery` |

### `ChatMediaApprovalUpdate`
_Source: `backend/ent/chatmediaapproval_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMediaApprovalMutation` |

### `ChatMediaApprovalUpdateOne`
_Source: `backend/ent/chatmediaapproval_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMediaApprovalMutation` |

### `ChatMember`
_Source: `backend/ent/chatmember.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `CreatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `ChatMemberCreate`
_Source: `backend/ent/chatmember_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*ChatMemberMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatMemberCreateBulk`
_Source: `backend/ent/chatmember_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*ChatMemberCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatMemberUpsertBulk`
_Source: `backend/ent/chatmember_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*ChatMemberCreateBulk` |

### `ChatMemberDelete`
_Source: `backend/ent/chatmember_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMemberMutation` |

### `ChatMemberDeleteOne`
_Source: `backend/ent/chatmember_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*ChatMemberDelete` |

### `ChatMemberQuery`
_Source: `backend/ent/chatmember_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]chatmember.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.ChatMember` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `ChatMemberGroupBy`
_Source: `backend/ent/chatmember_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*ChatMemberQuery` |

### `ChatMemberUpdate`
_Source: `backend/ent/chatmember_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMemberMutation` |

### `ChatMemberUpdateOne`
_Source: `backend/ent/chatmember_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatMemberMutation` |

### `ChatPreference`
_Source: `backend/ent/chatpreference.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `IsMuted` | `bool` |
| `IsPinned` | `bool` |
| `IsFavorite` | `bool` |
| `MutedUntil` | `*time.Time` |
| `QuietHoursEnabled` | `bool` |
| `QuietHoursStart` | `*string` |
| `QuietHoursEnd` | `*string` |
| `NotificationMode` | `string` |
| `NotifySenderIds` | `[]string` |
| `AlwaysNotifyMentions` | `bool` |
| `LastReadMessageID` | `*string` |
| `LastReadAt` | `*string` |
| `WallpaperFileID` | `*string` |
| `selectValues` | `sql.SelectValues` |

### `ChatPreferenceCreate`
_Source: `backend/ent/chatpreference_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*ChatPreferenceMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatPreferenceCreateBulk`
_Source: `backend/ent/chatpreference_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*ChatPreferenceCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `ChatPreferenceUpsertBulk`
_Source: `backend/ent/chatpreference_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*ChatPreferenceCreateBulk` |

### `ChatPreferenceDelete`
_Source: `backend/ent/chatpreference_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatPreferenceMutation` |

### `ChatPreferenceDeleteOne`
_Source: `backend/ent/chatpreference_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*ChatPreferenceDelete` |

### `ChatPreferenceQuery`
_Source: `backend/ent/chatpreference_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]chatpreference.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.ChatPreference` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `ChatPreferenceGroupBy`
_Source: `backend/ent/chatpreference_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*ChatPreferenceQuery` |

### `ChatPreferenceUpdate`
_Source: `backend/ent/chatpreference_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatPreferenceMutation` |

### `ChatPreferenceUpdateOne`
_Source: `backend/ent/chatpreference_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*ChatPreferenceMutation` |

### `ClientOperation`
_Source: `backend/ent/clientoperation.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `OperationID` | `string` |
| `OperationType` | `string` |
| `RequestHash` | `string` |
| `ResponseStatus` | `int` |
| `ResponseBody` | `map[string]interface{` |

### `ClientOperationCreate`
_Source: `backend/ent/clientoperation_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*ClientOperationMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `ClientOperationCreateBulk`
_Source: `backend/ent/clientoperation_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*ClientOperationCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `ClientOperationUpsertBulk`
_Source: `backend/ent/clientoperation_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*ClientOperationCreateBulk` |

### `ClientOperationDelete`
_Source: `backend/ent/clientoperation_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ClientOperationMutation` |

### `ClientOperationDeleteOne`
_Source: `backend/ent/clientoperation_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*ClientOperationDelete` |

### `ClientOperationQuery`
_Source: `backend/ent/clientoperation_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]clientoperation.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.ClientOperation` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `ClientOperationGroupBy`
_Source: `backend/ent/clientoperation_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*ClientOperationQuery` |

### `ClientOperationUpdate`
_Source: `backend/ent/clientoperation_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ClientOperationMutation` |

### `ClientOperationUpdateOne`
_Source: `backend/ent/clientoperation_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*ClientOperationMutation` |

### `ConsumerReceipt`
_Source: `backend/ent/consumerreceipt.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `EventID` | `string` |
| `Result` | `map[string]interface{` |

### `ConsumerReceiptCreate`
_Source: `backend/ent/consumerreceipt_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*ConsumerReceiptMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `ConsumerReceiptCreateBulk`
_Source: `backend/ent/consumerreceipt_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*ConsumerReceiptCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `ConsumerReceiptUpsertBulk`
_Source: `backend/ent/consumerreceipt_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*ConsumerReceiptCreateBulk` |

### `ConsumerReceiptDelete`
_Source: `backend/ent/consumerreceipt_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ConsumerReceiptMutation` |

### `ConsumerReceiptDeleteOne`
_Source: `backend/ent/consumerreceipt_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*ConsumerReceiptDelete` |

### `ConsumerReceiptQuery`
_Source: `backend/ent/consumerreceipt_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]consumerreceipt.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.ConsumerReceipt` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `ConsumerReceiptGroupBy`
_Source: `backend/ent/consumerreceipt_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*ConsumerReceiptQuery` |

### `ConsumerReceiptUpdate`
_Source: `backend/ent/consumerreceipt_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*ConsumerReceiptMutation` |

### `ConsumerReceiptUpdateOne`
_Source: `backend/ent/consumerreceipt_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*ConsumerReceiptMutation` |

### `ValidationError`
_Source: `backend/ent/ent.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `err` | `error` |

### `NotFoundError`
_Source: `backend/ent/ent.go`_

| Field | Type |
| :--- | :--- |
| `label` | `string` |

### `NotSingularError`
_Source: `backend/ent/ent.go`_

| Field | Type |
| :--- | :--- |
| `label` | `string` |

### `NotLoadedError`
_Source: `backend/ent/ent.go`_

| Field | Type |
| :--- | :--- |
| `edge` | `string` |

### `ConstraintError`
_Source: `backend/ent/ent.go`_

| Field | Type |
| :--- | :--- |
| `msg` | `string` |
| `wrap` | `error` |

### `Family`
_Source: `backend/ent/family.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `Name` | `string` |
| `StorageLimitMB` | `*int` |
| `MinimizedChatLayout` | `bool` |
| `DefaultMessageEncryptionProtocol` | `string` |
| `PublicAppURL` | `*string` |
| `PublicAPIURL` | `*string` |
| `CreatedAt` | `string` |
| `UpdatedAt` | `string` |
| `Edges` | `FamilyEdges` |
| `selectValues` | `sql.SelectValues` |

### `FamilyEdges`
_Source: `backend/ent/family.go`_

| Field | Type |
| :--- | :--- |
| `Users` | `[]*User` |
| `Chats` | `[]*Chat` |
| `Invites` | `[]*Invite` |
| `Files` | `[]*File` |
| `Plans` | `[]*Plan` |
| `McpConnectors` | `[]*McpConnector` |
| `McpAuditEvents` | `[]*McpAuditEvent` |
| `loadedTypes` | `[7]bool` |

### `FamilyCreate`
_Source: `backend/ent/family_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*FamilyMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `FamilyCreateBulk`
_Source: `backend/ent/family_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*FamilyCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `FamilyUpsertBulk`
_Source: `backend/ent/family_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*FamilyCreateBulk` |

### `FamilyDelete`
_Source: `backend/ent/family_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FamilyMutation` |

### `FamilyDeleteOne`
_Source: `backend/ent/family_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*FamilyDelete` |

### `FamilyQuery`
_Source: `backend/ent/family_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]family.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.Family` |
| `withUsers` | `*UserQuery` |
| `withChats` | `*ChatQuery` |
| `withInvites` | `*InviteQuery` |
| `withFiles` | `*FileQuery` |
| `withPlans` | `*PlanQuery` |
| `withMcpConnectors` | `*McpConnectorQuery` |
| `withMcpAuditEvents` | `*McpAuditEventQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `FamilyGroupBy`
_Source: `backend/ent/family_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*FamilyQuery` |

### `FamilyUpdate`
_Source: `backend/ent/family_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FamilyMutation` |

### `FamilyUpdateOne`
_Source: `backend/ent/family_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*FamilyMutation` |

### `FileEdges`
_Source: `backend/ent/file.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `Uploader` | `*User` |
| `Chat` | `*Chat` |
| `loadedTypes` | `[3]bool` |

### `FileCreate`
_Source: `backend/ent/file_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*FileMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `FileCreateBulk`
_Source: `backend/ent/file_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*FileCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `FileUpsertBulk`
_Source: `backend/ent/file_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*FileCreateBulk` |

### `FileDelete`
_Source: `backend/ent/file_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FileMutation` |

### `FileDeleteOne`
_Source: `backend/ent/file_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*FileDelete` |

### `FileQuery`
_Source: `backend/ent/file_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]file.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.File` |
| `withFamily` | `*FamilyQuery` |
| `withUploader` | `*UserQuery` |
| `withChat` | `*ChatQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `FileGroupBy`
_Source: `backend/ent/file_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*FileQuery` |

### `FileUpdate`
_Source: `backend/ent/file_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FileMutation` |

### `FileUpdateOne`
_Source: `backend/ent/file_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*FileMutation` |

### `FilePreference`
_Source: `backend/ent/filepreference.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `IsFavorite` | `bool` |
| `selectValues` | `sql.SelectValues` |

### `FilePreferenceCreate`
_Source: `backend/ent/filepreference_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*FilePreferenceMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `FilePreferenceCreateBulk`
_Source: `backend/ent/filepreference_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*FilePreferenceCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `FilePreferenceUpsertBulk`
_Source: `backend/ent/filepreference_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*FilePreferenceCreateBulk` |

### `FilePreferenceDelete`
_Source: `backend/ent/filepreference_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FilePreferenceMutation` |

### `FilePreferenceDeleteOne`
_Source: `backend/ent/filepreference_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*FilePreferenceDelete` |

### `FilePreferenceQuery`
_Source: `backend/ent/filepreference_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]filepreference.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.FilePreference` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `FilePreferenceGroupBy`
_Source: `backend/ent/filepreference_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*FilePreferenceQuery` |

### `FilePreferenceUpdate`
_Source: `backend/ent/filepreference_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FilePreferenceMutation` |

### `FilePreferenceUpdateOne`
_Source: `backend/ent/filepreference_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*FilePreferenceMutation` |

### `FileUploadCreate`
_Source: `backend/ent/fileupload_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*FileUploadMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `FileUploadCreateBulk`
_Source: `backend/ent/fileupload_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*FileUploadCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `FileUploadUpsertBulk`
_Source: `backend/ent/fileupload_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*FileUploadCreateBulk` |

### `FileUploadDelete`
_Source: `backend/ent/fileupload_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FileUploadMutation` |

### `FileUploadDeleteOne`
_Source: `backend/ent/fileupload_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*FileUploadDelete` |

### `FileUploadQuery`
_Source: `backend/ent/fileupload_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]fileupload.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.FileUpload` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `FileUploadGroupBy`
_Source: `backend/ent/fileupload_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*FileUploadQuery` |

### `FileUploadUpdate`
_Source: `backend/ent/fileupload_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*FileUploadMutation` |

### `FileUploadUpdateOne`
_Source: `backend/ent/fileupload_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*FileUploadMutation` |

### `Chain`
_Source: `backend/ent/hook/hook.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]ent.Hook` |

### `Invite`
_Source: `backend/ent/invite.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `FamilyID` | `string` |
| `TokenHash` | `string` |
| `Role` | `string` |
| `ExpiresAt` | `string` |
| `MaxUses` | `int` |
| `UsedCount` | `int` |
| `CreatedBy` | `string` |
| `CreatedAt` | `string` |
| `RevokedAt` | `*string` |
| `Edges` | `InviteEdges` |
| `selectValues` | `sql.SelectValues` |

### `InviteEdges`
_Source: `backend/ent/invite.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `Creator` | `*User` |
| `loadedTypes` | `[2]bool` |

### `InviteCreate`
_Source: `backend/ent/invite_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*InviteMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `InviteCreateBulk`
_Source: `backend/ent/invite_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*InviteCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `InviteUpsertBulk`
_Source: `backend/ent/invite_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*InviteCreateBulk` |

### `InviteDelete`
_Source: `backend/ent/invite_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*InviteMutation` |

### `InviteDeleteOne`
_Source: `backend/ent/invite_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*InviteDelete` |

### `InviteQuery`
_Source: `backend/ent/invite_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]invite.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.Invite` |
| `withFamily` | `*FamilyQuery` |
| `withCreator` | `*UserQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `InviteGroupBy`
_Source: `backend/ent/invite_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*InviteQuery` |

### `InviteUpdate`
_Source: `backend/ent/invite_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*InviteMutation` |

### `InviteUpdateOne`
_Source: `backend/ent/invite_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*InviteMutation` |

### `McpAuditEvent`
_Source: `backend/ent/mcpauditevent.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `FamilyID` | `string` |
| `ConnectorID` | `string` |
| `ActorUserID` | `string` |
| `Action` | `string` |
| `ChatID` | `*string` |
| `MessageID` | `*string` |
| `Success` | `bool` |
| `Error` | `*string` |
| `Meta` | `string` |
| `CreatedAt` | `string` |
| `Edges` | `McpAuditEventEdges` |
| `selectValues` | `sql.SelectValues` |

### `McpAuditEventEdges`
_Source: `backend/ent/mcpauditevent.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `Connector` | `*McpConnector` |
| `loadedTypes` | `[2]bool` |

### `McpAuditEventCreate`
_Source: `backend/ent/mcpauditevent_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*McpAuditEventMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `McpAuditEventCreateBulk`
_Source: `backend/ent/mcpauditevent_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*McpAuditEventCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `McpAuditEventUpsertBulk`
_Source: `backend/ent/mcpauditevent_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*McpAuditEventCreateBulk` |

### `McpAuditEventDelete`
_Source: `backend/ent/mcpauditevent_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*McpAuditEventMutation` |

### `McpAuditEventDeleteOne`
_Source: `backend/ent/mcpauditevent_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*McpAuditEventDelete` |

### `McpAuditEventQuery`
_Source: `backend/ent/mcpauditevent_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]mcpauditevent.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.McpAuditEvent` |
| `withFamily` | `*FamilyQuery` |
| `withConnector` | `*McpConnectorQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `McpAuditEventGroupBy`
_Source: `backend/ent/mcpauditevent_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*McpAuditEventQuery` |

### `McpAuditEventUpdate`
_Source: `backend/ent/mcpauditevent_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*McpAuditEventMutation` |

### `McpAuditEventUpdateOne`
_Source: `backend/ent/mcpauditevent_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*McpAuditEventMutation` |

### `McpConnector`
_Source: `backend/ent/mcpconnector.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Name` | `string` |
| `ActorUserID` | `string` |
| `TokenHash` | `string` |
| `Enabled` | `bool` |
| `RevokedAt` | `*string` |
| `CreatedBy` | `string` |
| `CreatedAt` | `string` |
| `LastUsedAt` | `*string` |
| `MaxHistoryMessages` | `int` |
| `Permissions` | `string` |
| `Provider` | `string` |
| `Alias` | `string` |
| `AuthMode` | `string` |
| `Edges` | `McpConnectorEdges` |
| `selectValues` | `sql.SelectValues` |

### `McpConnectorEdges`
_Source: `backend/ent/mcpconnector.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `Actor` | `*User` |
| `Creator` | `*User` |
| `AuditEvents` | `[]*McpAuditEvent` |
| `loadedTypes` | `[4]bool` |

### `McpConnectorCreate`
_Source: `backend/ent/mcpconnector_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*McpConnectorMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `McpConnectorCreateBulk`
_Source: `backend/ent/mcpconnector_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*McpConnectorCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `McpConnectorUpsertBulk`
_Source: `backend/ent/mcpconnector_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*McpConnectorCreateBulk` |

### `McpConnectorDelete`
_Source: `backend/ent/mcpconnector_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*McpConnectorMutation` |

### `McpConnectorDeleteOne`
_Source: `backend/ent/mcpconnector_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*McpConnectorDelete` |

### `McpConnectorQuery`
_Source: `backend/ent/mcpconnector_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]mcpconnector.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.McpConnector` |
| `withFamily` | `*FamilyQuery` |
| `withActor` | `*UserQuery` |
| `withCreator` | `*UserQuery` |
| `withAuditEvents` | `*McpAuditEventQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `McpConnectorGroupBy`
_Source: `backend/ent/mcpconnector_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*McpConnectorQuery` |

### `McpConnectorUpdate`
_Source: `backend/ent/mcpconnector_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*McpConnectorMutation` |

### `McpConnectorUpdateOne`
_Source: `backend/ent/mcpconnector_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*McpConnectorMutation` |

### `McpConnectorChat`
_Source: `backend/ent/mcpconnectorchat.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `ChatID` | `string` |
| `selectValues` | `sql.SelectValues` |

### `McpConnectorChatCreate`
_Source: `backend/ent/mcpconnectorchat_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*McpConnectorChatMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `McpConnectorChatCreateBulk`
_Source: `backend/ent/mcpconnectorchat_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*McpConnectorChatCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `McpConnectorChatUpsertBulk`
_Source: `backend/ent/mcpconnectorchat_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*McpConnectorChatCreateBulk` |

### `McpConnectorChatDelete`
_Source: `backend/ent/mcpconnectorchat_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*McpConnectorChatMutation` |

### `McpConnectorChatDeleteOne`
_Source: `backend/ent/mcpconnectorchat_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*McpConnectorChatDelete` |

### `McpConnectorChatQuery`
_Source: `backend/ent/mcpconnectorchat_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]mcpconnectorchat.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.McpConnectorChat` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `McpConnectorChatGroupBy`
_Source: `backend/ent/mcpconnectorchat_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*McpConnectorChatQuery` |

### `McpConnectorChatUpdate`
_Source: `backend/ent/mcpconnectorchat_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*McpConnectorChatMutation` |

### `McpConnectorChatUpdateOne`
_Source: `backend/ent/mcpconnectorchat_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*McpConnectorChatMutation` |

### `MediaQualitySetting`
_Source: `backend/ent/mediaqualitysetting.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `MediaType` | `string` |
| `Extension` | `string` |
| `QualityPercent` | `int` |
| `UpdatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `MediaQualitySettingCreate`
_Source: `backend/ent/mediaqualitysetting_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*MediaQualitySettingMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `MediaQualitySettingCreateBulk`
_Source: `backend/ent/mediaqualitysetting_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*MediaQualitySettingCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `MediaQualitySettingUpsertBulk`
_Source: `backend/ent/mediaqualitysetting_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*MediaQualitySettingCreateBulk` |

### `MediaQualitySettingDelete`
_Source: `backend/ent/mediaqualitysetting_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MediaQualitySettingMutation` |

### `MediaQualitySettingDeleteOne`
_Source: `backend/ent/mediaqualitysetting_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*MediaQualitySettingDelete` |

### `MediaQualitySettingQuery`
_Source: `backend/ent/mediaqualitysetting_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]mediaqualitysetting.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.MediaQualitySetting` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `MediaQualitySettingGroupBy`
_Source: `backend/ent/mediaqualitysetting_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*MediaQualitySettingQuery` |

### `MediaQualitySettingUpdate`
_Source: `backend/ent/mediaqualitysetting_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MediaQualitySettingMutation` |

### `MediaQualitySettingUpdateOne`
_Source: `backend/ent/mediaqualitysetting_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*MediaQualitySettingMutation` |

### `MessageEdges`
_Source: `backend/ent/message.go`_

| Field | Type |
| :--- | :--- |
| `Chat` | `*Chat` |
| `Sender` | `*User` |
| `loadedTypes` | `[2]bool` |

### `MessageCreate`
_Source: `backend/ent/message_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*MessageMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageCreateBulk`
_Source: `backend/ent/message_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*MessageCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageUpsertBulk`
_Source: `backend/ent/message_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*MessageCreateBulk` |

### `MessageDelete`
_Source: `backend/ent/message_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageMutation` |

### `MessageDeleteOne`
_Source: `backend/ent/message_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*MessageDelete` |

### `MessageQuery`
_Source: `backend/ent/message_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]message.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.Message` |
| `withChat` | `*ChatQuery` |
| `withSender` | `*UserQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `MessageGroupBy`
_Source: `backend/ent/message_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*MessageQuery` |

### `MessageUpdate`
_Source: `backend/ent/message_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageMutation` |

### `MessageUpdateOne`
_Source: `backend/ent/message_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageMutation` |

### `MessageAttachment`
_Source: `backend/ent/messageattachment.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `FileID` | `string` |
| `selectValues` | `sql.SelectValues` |

### `MessageAttachmentCreate`
_Source: `backend/ent/messageattachment_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*MessageAttachmentMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageAttachmentCreateBulk`
_Source: `backend/ent/messageattachment_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*MessageAttachmentCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageAttachmentUpsertBulk`
_Source: `backend/ent/messageattachment_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*MessageAttachmentCreateBulk` |

### `MessageAttachmentDelete`
_Source: `backend/ent/messageattachment_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageAttachmentMutation` |

### `MessageAttachmentDeleteOne`
_Source: `backend/ent/messageattachment_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*MessageAttachmentDelete` |

### `MessageAttachmentQuery`
_Source: `backend/ent/messageattachment_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]messageattachment.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.MessageAttachment` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `MessageAttachmentGroupBy`
_Source: `backend/ent/messageattachment_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*MessageAttachmentQuery` |

### `MessageAttachmentUpdate`
_Source: `backend/ent/messageattachment_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageAttachmentMutation` |

### `MessageAttachmentUpdateOne`
_Source: `backend/ent/messageattachment_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageAttachmentMutation` |

### `MessageReaction`
_Source: `backend/ent/messagereaction.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `Emoji` | `string` |
| `CreatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `MessageReactionCreate`
_Source: `backend/ent/messagereaction_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*MessageReactionMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageReactionCreateBulk`
_Source: `backend/ent/messagereaction_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*MessageReactionCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageReactionUpsertBulk`
_Source: `backend/ent/messagereaction_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*MessageReactionCreateBulk` |

### `MessageReactionDelete`
_Source: `backend/ent/messagereaction_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageReactionMutation` |

### `MessageReactionDeleteOne`
_Source: `backend/ent/messagereaction_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*MessageReactionDelete` |

### `MessageReactionQuery`
_Source: `backend/ent/messagereaction_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]messagereaction.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.MessageReaction` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `MessageReactionGroupBy`
_Source: `backend/ent/messagereaction_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*MessageReactionQuery` |

### `MessageReactionUpdate`
_Source: `backend/ent/messagereaction_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageReactionMutation` |

### `MessageReactionUpdateOne`
_Source: `backend/ent/messagereaction_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageReactionMutation` |

### `MessageStatus`
_Source: `backend/ent/messagestatus.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `Status` | `string` |
| `CreatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `MessageStatusCreate`
_Source: `backend/ent/messagestatus_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*MessageStatusMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageStatusCreateBulk`
_Source: `backend/ent/messagestatus_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*MessageStatusCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageStatusUpsertBulk`
_Source: `backend/ent/messagestatus_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*MessageStatusCreateBulk` |

### `MessageStatusDelete`
_Source: `backend/ent/messagestatus_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageStatusMutation` |

### `MessageStatusDeleteOne`
_Source: `backend/ent/messagestatus_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*MessageStatusDelete` |

### `MessageStatusQuery`
_Source: `backend/ent/messagestatus_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]messagestatus.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.MessageStatus` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `MessageStatusGroupBy`
_Source: `backend/ent/messagestatus_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*MessageStatusQuery` |

### `MessageStatusUpdate`
_Source: `backend/ent/messagestatus_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageStatusMutation` |

### `MessageStatusUpdateOne`
_Source: `backend/ent/messagestatus_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageStatusMutation` |

### `MessageUserDeletion`
_Source: `backend/ent/messageuserdeletion.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `DeletedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `MessageUserDeletionCreate`
_Source: `backend/ent/messageuserdeletion_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*MessageUserDeletionMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageUserDeletionCreateBulk`
_Source: `backend/ent/messageuserdeletion_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*MessageUserDeletionCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `MessageUserDeletionUpsertBulk`
_Source: `backend/ent/messageuserdeletion_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*MessageUserDeletionCreateBulk` |

### `MessageUserDeletionDelete`
_Source: `backend/ent/messageuserdeletion_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageUserDeletionMutation` |

### `MessageUserDeletionDeleteOne`
_Source: `backend/ent/messageuserdeletion_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*MessageUserDeletionDelete` |

### `MessageUserDeletionQuery`
_Source: `backend/ent/messageuserdeletion_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]messageuserdeletion.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.MessageUserDeletion` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `MessageUserDeletionGroupBy`
_Source: `backend/ent/messageuserdeletion_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*MessageUserDeletionQuery` |

### `MessageUserDeletionUpdate`
_Source: `backend/ent/messageuserdeletion_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageUserDeletionMutation` |

### `MessageUserDeletionUpdateOne`
_Source: `backend/ent/messageuserdeletion_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*MessageUserDeletionMutation` |

### `Schema`
_Source: `backend/ent/migrate/migrate.go`_

| Field | Type |
| :--- | :--- |
| `drv` | `dialect.Driver` |

### `CallParticipantMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `user_id` | `*string` |
| `role` | `*string` |
| `state` | `*string` |
| `joined_at` | `*time.Time` |
| `clearedFields` | `map[string]struct{` |

### `CallSessionMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `call_type` | `*string` |
| `state` | `*string` |
| `created_at` | `*time.Time` |
| `ended_at` | `*time.Time` |
| `duration_s` | `*int` |
| `addduration_s` | `*int` |
| `topology` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `ChatMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `_type` | `*string` |
| `title` | `*string` |
| `description` | `*string` |
| `chat_photo_file_id` | `*string` |
| `chat_avatar_mode` | `*string` |
| `chat_avatar_symbol_id` | `*string` |
| `chat_avatar_color_id` | `*string` |
| `media_visibility` | `*string` |
| `comments_enabled` | `*bool` |
| `encryption_protocol` | `*string` |
| `created_at` | `*string` |
| `updated_at` | `*string` |
| `pin_permission` | `*string` |
| `message_delay_seconds` | `*int` |
| `addmessage_delay_seconds` | `*int` |
| `clearedFields` | `map[string]struct{` |

### `ChatMediaApprovalMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `user_id` | `*string` |
| `created_at` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `ChatMemberMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `user_id` | `*string` |
| `created_at` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `ChatPreferenceMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `user_id` | `*string` |
| `is_muted` | `*bool` |
| `is_pinned` | `*bool` |
| `is_favorite` | `*bool` |
| `muted_until` | `*time.Time` |
| `quiet_hours_enabled` | `*bool` |
| `quiet_hours_start` | `*string` |
| `quiet_hours_end` | `*string` |
| `notification_mode` | `*string` |
| `notify_sender_ids` | `*[]string` |
| `appendnotify_sender_ids` | `[]string` |
| `always_notify_mentions` | `*bool` |
| `last_read_message_id` | `*string` |
| `last_read_at` | `*string` |
| `wallpaper_file_id` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `ClientOperationMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `operation_id` | `*string` |
| `operation_type` | `*string` |
| `request_hash` | `*string` |
| `response_status` | `*int` |
| `addresponse_status` | `*int` |
| `response_body` | `*map[string]interface{` |

### `ConsumerReceiptMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `event_id` | `*string` |
| `result` | `*map[string]interface{` |

### `FamilyMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `name` | `*string` |
| `storage_limit_mb` | `*int` |
| `addstorage_limit_mb` | `*int` |
| `minimized_chat_layout` | `*bool` |
| `default_message_encryption_protocol` | `*string` |
| `public_app_url` | `*string` |
| `public_api_url` | `*string` |
| `created_at` | `*string` |
| `updated_at` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `FilePreferenceMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `user_id` | `*string` |
| `is_favorite` | `*bool` |
| `clearedFields` | `map[string]struct{` |

### `InviteMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `token_hash` | `*string` |
| `role` | `*string` |
| `expires_at` | `*string` |
| `max_uses` | `*int` |
| `addmax_uses` | `*int` |
| `used_count` | `*int` |
| `addused_count` | `*int` |
| `created_at` | `*string` |
| `revoked_at` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `McpAuditEventMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `actor_user_id` | `*string` |
| `action` | `*string` |
| `chat_id` | `*string` |
| `message_id` | `*string` |
| `success` | `*bool` |
| `error` | `*string` |
| `meta` | `*string` |
| `created_at` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `McpConnectorMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `name` | `*string` |
| `token_hash` | `*string` |
| `enabled` | `*bool` |
| `revoked_at` | `*string` |
| `created_at` | `*string` |
| `last_used_at` | `*string` |
| `max_history_messages` | `*int` |
| `addmax_history_messages` | `*int` |
| `permissions` | `*string` |
| `provider` | `*string` |
| `alias` | `*string` |
| `auth_mode` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `McpConnectorChatMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `chat_id` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `MediaQualitySettingMutation`
_Source: `backend/ent/mutation.go`_

| Field | Type |
| :--- | :--- |
| `op` | `Op` |
| `typ` | `string` |
| `id` | `*string` |
| `media_type` | `*string` |
| `extension` | `*string` |
| `quality_percent` | `*int` |
| `addquality_percent` | `*int` |
| `updated_at` | `*string` |
| `clearedFields` | `map[string]struct{` |

### `NotificationDelivery`
_Source: `backend/ent/notificationdelivery.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `RecipientID` | `string` |
| `Channel` | `string` |
| `State` | `string` |
| `Attempts` | `int` |
| `ProviderID` | `*string` |
| `LastError` | `*string` |
| `CreatedAt` | `time.Time` |
| `UpdatedAt` | `time.Time` |
| `selectValues` | `sql.SelectValues` |

### `NotificationDeliveryCreate`
_Source: `backend/ent/notificationdelivery_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*NotificationDeliveryMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `NotificationDeliveryCreateBulk`
_Source: `backend/ent/notificationdelivery_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*NotificationDeliveryCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `NotificationDeliveryUpsertBulk`
_Source: `backend/ent/notificationdelivery_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*NotificationDeliveryCreateBulk` |

### `NotificationDeliveryDelete`
_Source: `backend/ent/notificationdelivery_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*NotificationDeliveryMutation` |

### `NotificationDeliveryDeleteOne`
_Source: `backend/ent/notificationdelivery_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*NotificationDeliveryDelete` |

### `NotificationDeliveryQuery`
_Source: `backend/ent/notificationdelivery_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]notificationdelivery.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.NotificationDelivery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `NotificationDeliveryGroupBy`
_Source: `backend/ent/notificationdelivery_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*NotificationDeliveryQuery` |

### `NotificationDeliveryUpdate`
_Source: `backend/ent/notificationdelivery_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*NotificationDeliveryMutation` |

### `NotificationDeliveryUpdateOne`
_Source: `backend/ent/notificationdelivery_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*NotificationDeliveryMutation` |

### `OutboxEvent`
_Source: `backend/ent/outboxevent.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `SyncEventID` | `*string` |
| `FamilyID` | `*string` |
| `Topic` | `string` |
| `SchemaVersion` | `int` |
| `PartitionKey` | `string` |
| `Payload` | `map[string]interface{` |

### `OutboxEventCreate`
_Source: `backend/ent/outboxevent_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*OutboxEventMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `OutboxEventCreateBulk`
_Source: `backend/ent/outboxevent_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*OutboxEventCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `OutboxEventUpsertBulk`
_Source: `backend/ent/outboxevent_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*OutboxEventCreateBulk` |

### `OutboxEventDelete`
_Source: `backend/ent/outboxevent_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*OutboxEventMutation` |

### `OutboxEventDeleteOne`
_Source: `backend/ent/outboxevent_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*OutboxEventDelete` |

### `OutboxEventQuery`
_Source: `backend/ent/outboxevent_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]outboxevent.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.OutboxEvent` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `OutboxEventGroupBy`
_Source: `backend/ent/outboxevent_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*OutboxEventQuery` |

### `OutboxEventUpdate`
_Source: `backend/ent/outboxevent_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*OutboxEventMutation` |

### `OutboxEventUpdateOne`
_Source: `backend/ent/outboxevent_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*OutboxEventMutation` |

### `PinnedMessage`
_Source: `backend/ent/pinnedmessage.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `MessageID` | `string` |
| `PinnedBy` | `string` |
| `PinnedAt` | `time.Time` |
| `selectValues` | `sql.SelectValues` |

### `PinnedMessageCreate`
_Source: `backend/ent/pinnedmessage_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*PinnedMessageMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `PinnedMessageCreateBulk`
_Source: `backend/ent/pinnedmessage_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*PinnedMessageCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `PinnedMessageUpsertBulk`
_Source: `backend/ent/pinnedmessage_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*PinnedMessageCreateBulk` |

### `PinnedMessageDelete`
_Source: `backend/ent/pinnedmessage_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PinnedMessageMutation` |

### `PinnedMessageDeleteOne`
_Source: `backend/ent/pinnedmessage_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*PinnedMessageDelete` |

### `PinnedMessageQuery`
_Source: `backend/ent/pinnedmessage_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]pinnedmessage.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.PinnedMessage` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `PinnedMessageGroupBy`
_Source: `backend/ent/pinnedmessage_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*PinnedMessageQuery` |

### `PinnedMessageUpdate`
_Source: `backend/ent/pinnedmessage_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PinnedMessageMutation` |

### `PinnedMessageUpdateOne`
_Source: `backend/ent/pinnedmessage_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*PinnedMessageMutation` |

### `Plan`
_Source: `backend/ent/plan.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Title` | `string` |
| `Notes` | `*string` |
| `Location` | `*string` |
| `StartsAt` | `string` |
| `EndsAt` | `string` |
| `AllDay` | `bool` |
| `TimeZone` | `string` |
| `Recurrence` | `*string` |
| `CreatedBy` | `string` |
| `SourceChatID` | `*string` |
| `Revision` | `int` |
| `CreatedAt` | `string` |
| `UpdatedAt` | `string` |
| `DeletedAt` | `*string` |
| `Edges` | `PlanEdges` |
| `selectValues` | `sql.SelectValues` |

### `PlanEdges`
_Source: `backend/ent/plan.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `Creator` | `*User` |
| `SourceChat` | `*Chat` |
| `loadedTypes` | `[3]bool` |

### `PlanCreate`
_Source: `backend/ent/plan_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*PlanMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `PlanCreateBulk`
_Source: `backend/ent/plan_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*PlanCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `PlanUpsertBulk`
_Source: `backend/ent/plan_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*PlanCreateBulk` |

### `PlanDelete`
_Source: `backend/ent/plan_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PlanMutation` |

### `PlanDeleteOne`
_Source: `backend/ent/plan_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*PlanDelete` |

### `PlanQuery`
_Source: `backend/ent/plan_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]plan.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.Plan` |
| `withFamily` | `*FamilyQuery` |
| `withCreator` | `*UserQuery` |
| `withSourceChat` | `*ChatQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `PlanGroupBy`
_Source: `backend/ent/plan_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*PlanQuery` |

### `PlanUpdate`
_Source: `backend/ent/plan_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PlanMutation` |

### `PlanUpdateOne`
_Source: `backend/ent/plan_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*PlanMutation` |

### `PlanAttendee`
_Source: `backend/ent/planattendee.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `Status` | `string` |
| `UpdatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `PlanAttendeeCreate`
_Source: `backend/ent/planattendee_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*PlanAttendeeMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `PlanAttendeeCreateBulk`
_Source: `backend/ent/planattendee_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*PlanAttendeeCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `PlanAttendeeUpsertBulk`
_Source: `backend/ent/planattendee_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*PlanAttendeeCreateBulk` |

### `PlanAttendeeDelete`
_Source: `backend/ent/planattendee_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PlanAttendeeMutation` |

### `PlanAttendeeDeleteOne`
_Source: `backend/ent/planattendee_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*PlanAttendeeDelete` |

### `PlanAttendeeQuery`
_Source: `backend/ent/planattendee_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]planattendee.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.PlanAttendee` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `PlanAttendeeGroupBy`
_Source: `backend/ent/planattendee_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*PlanAttendeeQuery` |

### `PlanAttendeeUpdate`
_Source: `backend/ent/planattendee_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PlanAttendeeMutation` |

### `PlanAttendeeUpdateOne`
_Source: `backend/ent/planattendee_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*PlanAttendeeMutation` |

### `Poll`
_Source: `backend/ent/poll.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `ChatID` | `string` |
| `MessageID` | `string` |
| `Question` | `string` |
| `IsAnonymous` | `bool` |
| `AllowMultiple` | `bool` |
| `IsQuiz` | `bool` |
| `CorrectOptionID` | `*string` |
| `Explanation` | `*string` |
| `IsClosed` | `bool` |
| `CreatedAt` | `string` |
| `ClosedAt` | `*string` |
| `selectValues` | `sql.SelectValues` |

### `PollCreate`
_Source: `backend/ent/poll_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*PollMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `PollCreateBulk`
_Source: `backend/ent/poll_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*PollCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `PollUpsertBulk`
_Source: `backend/ent/poll_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*PollCreateBulk` |

### `PollDelete`
_Source: `backend/ent/poll_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PollMutation` |

### `PollDeleteOne`
_Source: `backend/ent/poll_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*PollDelete` |

### `PollQuery`
_Source: `backend/ent/poll_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]poll.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.Poll` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `PollGroupBy`
_Source: `backend/ent/poll_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*PollQuery` |

### `PollUpdate`
_Source: `backend/ent/poll_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PollMutation` |

### `PollUpdateOne`
_Source: `backend/ent/poll_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*PollMutation` |

### `PollOption`
_Source: `backend/ent/polloption.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `PollID` | `string` |
| `Text` | `string` |
| `OptionIndex` | `int` |
| `selectValues` | `sql.SelectValues` |

### `PollOptionCreate`
_Source: `backend/ent/polloption_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*PollOptionMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `PollOptionCreateBulk`
_Source: `backend/ent/polloption_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*PollOptionCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `PollOptionUpsertBulk`
_Source: `backend/ent/polloption_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*PollOptionCreateBulk` |

### `PollOptionDelete`
_Source: `backend/ent/polloption_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PollOptionMutation` |

### `PollOptionDeleteOne`
_Source: `backend/ent/polloption_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*PollOptionDelete` |

### `PollOptionQuery`
_Source: `backend/ent/polloption_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]polloption.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.PollOption` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `PollOptionGroupBy`
_Source: `backend/ent/polloption_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*PollOptionQuery` |

### `PollOptionUpdate`
_Source: `backend/ent/polloption_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PollOptionMutation` |

### `PollOptionUpdateOne`
_Source: `backend/ent/polloption_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*PollOptionMutation` |

### `PollVote`
_Source: `backend/ent/pollvote.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `PollID` | `string` |
| `OptionID` | `string` |
| `UserID` | `string` |
| `CreatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `PollVoteCreate`
_Source: `backend/ent/pollvote_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*PollVoteMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `PollVoteCreateBulk`
_Source: `backend/ent/pollvote_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*PollVoteCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `PollVoteUpsertBulk`
_Source: `backend/ent/pollvote_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*PollVoteCreateBulk` |

### `PollVoteDelete`
_Source: `backend/ent/pollvote_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PollVoteMutation` |

### `PollVoteDeleteOne`
_Source: `backend/ent/pollvote_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*PollVoteDelete` |

### `PollVoteQuery`
_Source: `backend/ent/pollvote_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]pollvote.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.PollVote` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `PollVoteGroupBy`
_Source: `backend/ent/pollvote_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*PollVoteQuery` |

### `PollVoteUpdate`
_Source: `backend/ent/pollvote_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*PollVoteMutation` |

### `PollVoteUpdateOne`
_Source: `backend/ent/pollvote_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*PollVoteMutation` |

### `RefreshToken`
_Source: `backend/ent/refreshtoken.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `TokenHash` | `string` |
| `ExpiresAt` | `string` |
| `CreatedAt` | `string` |
| `RevokedAt` | `*string` |
| `IPAddress` | `*string` |
| `Edges` | `RefreshTokenEdges` |
| `selectValues` | `sql.SelectValues` |

### `RefreshTokenEdges`
_Source: `backend/ent/refreshtoken.go`_

| Field | Type |
| :--- | :--- |
| `User` | `*User` |
| `loadedTypes` | `[1]bool` |

### `RefreshTokenCreate`
_Source: `backend/ent/refreshtoken_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*RefreshTokenMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `RefreshTokenCreateBulk`
_Source: `backend/ent/refreshtoken_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*RefreshTokenCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `RefreshTokenUpsertBulk`
_Source: `backend/ent/refreshtoken_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*RefreshTokenCreateBulk` |

### `RefreshTokenDelete`
_Source: `backend/ent/refreshtoken_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*RefreshTokenMutation` |

### `RefreshTokenDeleteOne`
_Source: `backend/ent/refreshtoken_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*RefreshTokenDelete` |

### `RefreshTokenQuery`
_Source: `backend/ent/refreshtoken_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]refreshtoken.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.RefreshToken` |
| `withUser` | `*UserQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `RefreshTokenGroupBy`
_Source: `backend/ent/refreshtoken_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*RefreshTokenQuery` |

### `RefreshTokenUpdate`
_Source: `backend/ent/refreshtoken_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*RefreshTokenMutation` |

### `RefreshTokenUpdateOne`
_Source: `backend/ent/refreshtoken_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*RefreshTokenMutation` |

### `SyncEvent`
_Source: `backend/ent/syncevent.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `Sequence` | `int64` |
| `FamilyID` | `string` |
| `Audience` | `string` |
| `EventType` | `string` |
| `SchemaVersion` | `int` |
| `AggregateType` | `string` |
| `AggregateID` | `string` |
| `Payload` | `map[string]interface{` |

### `SyncEventCreate`
_Source: `backend/ent/syncevent_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*SyncEventMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `SyncEventCreateBulk`
_Source: `backend/ent/syncevent_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*SyncEventCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `SyncEventUpsertBulk`
_Source: `backend/ent/syncevent_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*SyncEventCreateBulk` |

### `SyncEventDelete`
_Source: `backend/ent/syncevent_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*SyncEventMutation` |

### `SyncEventDeleteOne`
_Source: `backend/ent/syncevent_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*SyncEventDelete` |

### `SyncEventQuery`
_Source: `backend/ent/syncevent_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]syncevent.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.SyncEvent` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `SyncEventGroupBy`
_Source: `backend/ent/syncevent_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*SyncEventQuery` |

### `SyncEventUpdate`
_Source: `backend/ent/syncevent_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*SyncEventMutation` |

### `SyncEventUpdateOne`
_Source: `backend/ent/syncevent_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*SyncEventMutation` |

### `SyncEventRecipient`
_Source: `backend/ent/synceventrecipient.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `UserID` | `string` |
| `CreatedAt` | `time.Time` |
| `selectValues` | `sql.SelectValues` |

### `SyncEventRecipientCreate`
_Source: `backend/ent/synceventrecipient_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*SyncEventRecipientMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `SyncEventRecipientCreateBulk`
_Source: `backend/ent/synceventrecipient_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*SyncEventRecipientCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `SyncEventRecipientUpsertBulk`
_Source: `backend/ent/synceventrecipient_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*SyncEventRecipientCreateBulk` |

### `SyncEventRecipientDelete`
_Source: `backend/ent/synceventrecipient_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*SyncEventRecipientMutation` |

### `SyncEventRecipientDeleteOne`
_Source: `backend/ent/synceventrecipient_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*SyncEventRecipientDelete` |

### `SyncEventRecipientQuery`
_Source: `backend/ent/synceventrecipient_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]synceventrecipient.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.SyncEventRecipient` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `SyncEventRecipientGroupBy`
_Source: `backend/ent/synceventrecipient_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*SyncEventRecipientQuery` |

### `SyncEventRecipientUpdate`
_Source: `backend/ent/synceventrecipient_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*SyncEventRecipientMutation` |

### `SyncEventRecipientUpdateOne`
_Source: `backend/ent/synceventrecipient_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*SyncEventRecipientMutation` |

### `UserEdges`
_Source: `backend/ent/user.go`_

| Field | Type |
| :--- | :--- |
| `Family` | `*Family` |
| `RefreshTokens` | `[]*RefreshToken` |
| `InvitesCreated` | `[]*Invite` |
| `ChatsCreated` | `[]*Chat` |
| `FilesUploaded` | `[]*File` |
| `MessagesSent` | `[]*Message` |
| `CallsOutgoing` | `[]*CallSession` |
| `CallsIncoming` | `[]*CallSession` |
| `PlansCreated` | `[]*Plan` |
| `McpActorConnectors` | `[]*McpConnector` |
| `McpConnectorsCreated` | `[]*McpConnector` |
| `loadedTypes` | `[11]bool` |

### `UserCreate`
_Source: `backend/ent/user_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*UserMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `UserCreateBulk`
_Source: `backend/ent/user_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*UserCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `UserUpsertBulk`
_Source: `backend/ent/user_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*UserCreateBulk` |

### `UserDelete`
_Source: `backend/ent/user_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*UserMutation` |

### `UserDeleteOne`
_Source: `backend/ent/user_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*UserDelete` |

### `UserQuery`
_Source: `backend/ent/user_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]user.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.User` |
| `withFamily` | `*FamilyQuery` |
| `withRefreshTokens` | `*RefreshTokenQuery` |
| `withInvitesCreated` | `*InviteQuery` |
| `withChatsCreated` | `*ChatQuery` |
| `withFilesUploaded` | `*FileQuery` |
| `withMessagesSent` | `*MessageQuery` |
| `withCallsOutgoing` | `*CallSessionQuery` |
| `withCallsIncoming` | `*CallSessionQuery` |
| `withPlansCreated` | `*PlanQuery` |
| `withMcpActorConnectors` | `*McpConnectorQuery` |
| `withMcpConnectorsCreated` | `*McpConnectorQuery` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `UserGroupBy`
_Source: `backend/ent/user_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*UserQuery` |

### `UserUpdate`
_Source: `backend/ent/user_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*UserMutation` |

### `UserUpdateOne`
_Source: `backend/ent/user_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*UserMutation` |

### `UserBlock`
_Source: `backend/ent/userblock.go`_

| Field | Type |
| :--- | :--- |
| `config` | ``json:"-"`` |
| `ID` | `string` |
| `BlockedUserID` | `string` |
| `CreatedAt` | `string` |
| `selectValues` | `sql.SelectValues` |

### `UserBlockCreate`
_Source: `backend/ent/userblock_create.go`_

| Field | Type |
| :--- | :--- |
| `mutation` | `*UserBlockMutation` |
| `hooks` | `[]Hook` |
| `conflict` | `[]sql.ConflictOption` |

### `UserBlockCreateBulk`
_Source: `backend/ent/userblock_create.go`_

| Field | Type |
| :--- | :--- |
| `err` | `error` |
| `builders` | `[]*UserBlockCreate` |
| `conflict` | `[]sql.ConflictOption` |

### `UserBlockUpsertBulk`
_Source: `backend/ent/userblock_create.go`_

| Field | Type |
| :--- | :--- |
| `create` | `*UserBlockCreateBulk` |

### `UserBlockDelete`
_Source: `backend/ent/userblock_delete.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*UserBlockMutation` |

### `UserBlockDeleteOne`
_Source: `backend/ent/userblock_delete.go`_

| Field | Type |
| :--- | :--- |
| `_d` | `*UserBlockDelete` |

### `UserBlockQuery`
_Source: `backend/ent/userblock_query.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `*QueryContext` |
| `order` | `[]userblock.OrderOption` |
| `inters` | `[]Interceptor` |
| `predicates` | `[]predicate.UserBlock` |
| `sql` | `*sql.Selector` |
| `path` | `func(context.Context)` |

### `UserBlockGroupBy`
_Source: `backend/ent/userblock_query.go`_

| Field | Type |
| :--- | :--- |
| `build` | `*UserBlockQuery` |

### `UserBlockUpdate`
_Source: `backend/ent/userblock_update.go`_

| Field | Type |
| :--- | :--- |
| `hooks` | `[]Hook` |
| `mutation` | `*UserBlockMutation` |

### `UserBlockUpdateOne`
_Source: `backend/ent/userblock_update.go`_

| Field | Type |
| :--- | :--- |
| `fields` | `[]string` |
| `hooks` | `[]Hook` |
| `mutation` | `*UserBlockMutation` |

### `Store`
_Source: `backend/internal/adapters/adminencryption/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/authmethods/postgres.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/callsessions/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/canvasstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Canvas`
_Source: `backend/internal/adapters/canvasstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `LinkedChatIDs` | `[]string` |
| `CreatedAt,` | `UpdatedAt` |

### `Card`
_Source: `backend/internal/adapters/canvasstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `Title` |

### `Update`
_Source: `backend/internal/adapters/canvasstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `Sequence` | `int64` |
| `Ciphertext,` | `Nonce,` |
| `CreatedAt` | `time.Time` |

### `CreateInput`
_Source: `backend/internal/adapters/canvasstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |

### `Store`
_Source: `backend/internal/adapters/chatarchives/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/chatcreation/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/chatimports/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/chatpins/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/chatqueries/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `DelayStore`
_Source: `backend/internal/adapters/chatsettings/delay_store.go`_

| Field | Type |
| :--- | :--- |
| `store` | `*repository.Store` |

### `Checker`
_Source: `backend/internal/adapters/databasehealth/health.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `PostgresStore`
_Source: `backend/internal/adapters/familydefaults/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/familyinvites/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/familymembers/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/familyprofiles/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/familyqueries/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/fileaccess/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/fileclones/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `PostgresStore`
_Source: `backend/internal/adapters/filedeletions/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/filelisting/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/filepreferences/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Reader`
_Source: `backend/internal/adapters/fileuploads/reader.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `PostgresStore`
_Source: `backend/internal/adapters/filevalidation/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Options`
_Source: `backend/internal/adapters/groq/options.go`_

| Field | Type |
| :--- | :--- |
| `APIKey,` | `BaseURL,` |

### `Store`
_Source: `backend/internal/adapters/identitylogin/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/identityprofiles/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Writer`
_Source: `backend/internal/adapters/identitysessions/writer.go`_

| Field | Type |
| :--- | :--- |
| `store` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/identitysetup/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/identitystatus/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `BackfillSnapshot`
_Source: `backend/internal/adapters/intelligencesourcev2/backfill_page_store.go`_

| Field | Type |
| :--- | :--- |
| `ResourceID,` | `RevisionID` |
| `Metadata` | `[]byte` |
| `ObservedAt` | `time.Time` |
| `Protocol` | `string` |
| `Content,` | `Ciphertext,` |

### `BackfillPage`
_Source: `backend/internal/adapters/intelligencesourcev2/backfill_page_store.go`_

| Field | Type |
| :--- | :--- |
| `FenceSequence` | `int64` |
| `HasMore` | `bool` |
| `CreatedAt` | `time.Time` |
| `Snapshots` | `[]BackfillSnapshot` |

### `BackfillStart`
_Source: `backend/internal/adapters/intelligencesourcev2/backfill_store.go`_

| Field | Type |
| :--- | :--- |
| `BackfillID` | `string` |
| `Fence` | `int64` |
| `CreatedAt` | `time.Time` |

### `Store`
_Source: `backend/internal/adapters/intelligencesourcev2/backup_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `RetentionResult`
_Source: `backend/internal/adapters/intelligencesourcev2/backup_store.go`_

| Field | Type |
| :--- | :--- |
| `TombstonesPruned,` | `BackupsPruned` |

### `RestoreTombstone`
_Source: `backend/internal/adapters/intelligencesourcev2/backup_store.go`_

| Field | Type |
| :--- | :--- |
| `EventID,` | `ConnectionID,` |
| `Sequence` | `int64` |
| `CreatedAt` | `time.Time` |

### `BrowserSession`
_Source: `backend/internal/adapters/intelligencesourcev2/browser_store.go`_

| Field | Type |
| :--- | :--- |
| `TicketHash` | `[]byte` |
| `Flow,` | `UserID,` |
| `ClientID,` | `RedirectURI,` |
| `CodeChallenge,` | `CodeChallengeMethod,` |
| `ChatID` | `string` |
| `ScopeKind` | `string` |
| `ConfirmSpaceAccess` | `bool` |
| `Grants` | `map[string]bool` |
| `CreatedAt,` | `ExpiresAt` |

### `OIDCBrowserSessionExpectation`
_Source: `backend/internal/adapters/intelligencesourcev2/browser_store.go`_

| Field | Type |
| :--- | :--- |
| `ClientID,` | `RedirectURI,` |
| `ResponseTypeCode` | `bool` |
| `AllowedClientID` | `bool` |
| `RedirectURIAllowed` | `bool` |

### `OIDCBrowserAuthorization`
_Source: `backend/internal/adapters/intelligencesourcev2/browser_store.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `ClientID,` |

### `SourceV2BrowserAuthorization`
_Source: `backend/internal/adapters/intelligencesourcev2/browser_store.go`_

| Field | Type |
| :--- | :--- |
| `TicketHash,` | `CodeHash` |
| `ClientID,` | `RedirectURI,` |
| `ConfirmSpaceAccess` | `bool` |
| `Grants` | `map[string]bool` |
| `Now,` | `CodeExpiresAt` |

### `RotatedCredential`
_Source: `backend/internal/adapters/intelligencesourcev2/connections_store.go`_

| Field | Type |
| :--- | :--- |
| `InstallationID` | `string` |
| `PrincipalUserID` | `string` |
| `ScopeKind` | `string` |
| `ScopeID` | `string` |
| `ChatID` | `string` |
| `Grants` | `map[string]bool` |

### `ConsentAuthorization`
_Source: `backend/internal/adapters/intelligencesourcev2/consent_store.go`_

| Field | Type |
| :--- | :--- |
| `CodeHash` | `[]byte` |
| `ClientID,` | `RedirectURI,` |
| `Grants` | `map[string]bool` |
| `ScopeKind` | `string` |
| `ConfirmSpaceAccess` | `bool` |
| `Now,` | `ExpiresAt` |

### `CredentialExchange`
_Source: `backend/internal/adapters/intelligencesourcev2/consent_store.go`_

| Field | Type |
| :--- | :--- |
| `CodeHash,` | `CredentialHash` |
| `ClientID,` | `RedirectURI` |
| `VerifyPKCE` | `func(string)` |
| `Now,` | `CredentialExpiresAt` |

### `IssuedCredential`
_Source: `backend/internal/adapters/intelligencesourcev2/consent_store.go`_

| Field | Type |
| :--- | :--- |
| `ConnectionID` | `string` |
| `ScopeKind` | `string` |
| `ScopeID` | `string` |
| `ChatID` | `string` |
| `Grants` | `map[string]bool` |

### `EventRecord`
_Source: `backend/internal/adapters/intelligencesourcev2/events_store.go`_

| Field | Type |
| :--- | :--- |
| `EventID,` | `ResourceID,` |
| `Sequence` | `int64` |
| `ObservedAt` | `time.Time` |
| `Tombstone` | `bool` |

### `OIDCAuthorizationCode`
_Source: `backend/internal/adapters/intelligencesourcev2/oidc_store.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `Nonce` |

### `SnapshotRecord`
_Source: `backend/internal/adapters/intelligencesourcev2/reads_store.go`_

| Field | Type |
| :--- | :--- |
| `ResourceID,` | `RevisionID` |
| `Metadata` | `[]byte` |
| `ObservedAt` | `time.Time` |
| `Protocol` | `string` |
| `Content,` | `Ciphertext,` |

### `TokenIssuer`
_Source: `backend/internal/adapters/livekit/token_issuer.go`_

| Field | Type |
| :--- | :--- |
| `URL` | `string` |
| `APIKey` | `string` |
| `APISecret` | `string` |

### `Store`
_Source: `backend/internal/adapters/mcpaudit/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/mcpconnectors/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/messageattachments/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/messagedetail/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messageforwards/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messagehistory/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messagemutations/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messagepersistence/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messagereactions/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messagereads/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `Store`
_Source: `backend/internal/adapters/messagesearch/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/messagesync/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `Store`
_Source: `backend/internal/adapters/messageunread/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/notificationprovider/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `PostgresStore`
_Source: `backend/internal/adapters/outbox/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `RedisConsumer`
_Source: `backend/internal/adapters/outbox/redis_consumer.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*redis.Client` |

### `RedisPublisher`
_Source: `backend/internal/adapters/outbox/redis_publisher.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*redis.Client` |
| `stream` | `string` |

### `Store`
_Source: `backend/internal/adapters/polls/store.go`_

| Field | Type |
| :--- | :--- |
| `repository` | `*repository.Store` |

### `PostgresStore`
_Source: `backend/internal/adapters/publicaccess/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `RedisCallSessionCache`
_Source: `backend/internal/adapters/realtimecache/redis_call_sessions.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*redis.Client` |

### `RedisPendingEventQueue`
_Source: `backend/internal/adapters/realtimecache/redis_pending_events.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*redis.Client` |

### `PostgresStore`
_Source: `backend/internal/adapters/roles/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `ServerOverview`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `TotalMessages` | `int` |
| `TotalMedia` | `int` |
| `TotalChats` | `int` |
| `TotalUsers` | `int` |
| `AvgResponseTimeSeconds` | `float64` |
| `FastResponsePercent` | `float64` |
| `TotalConversationsStarted` | `int` |
| `AvgSessionDurationMinutes` | `float64` |
| `MessagesByHour` | `[24]int` |
| `MessagesByDayOfWeek` | `[7]int` |
| `ResponseTimeBuckets` | `ResponseTimeBuckets` |
| `TopConversationStarters` | `[]ConversationStarter` |
| `TopActiveChats` | `[]ActiveChat` |

### `ResponseTimeBuckets`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `Under1Min` | `int` |
| `From1To5Min` | `int` |
| `From5To30Min` | `int` |
| `Over30Min` | `int` |

### `ConversationStarter`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `DisplayName` | `string` |
| `StartsCount` | `int` |
| `Percentage` | `float64` |

### `ActiveChat`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `Title` | `string` |
| `Type` | `string` |
| `MessageCount` | `int` |

### `ChatStats`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `TotalMessages` | `int` |
| `TotalMedia` | `int` |
| `TotalMembers` | `int` |
| `AvgResponseTimeSeconds` | `float64` |
| `FastestResponderName` | `string` |
| `FastestResponderSpeed` | `float64` |
| `MessagesByHour` | `[24]int` |
| `TopMembers` | `[]ChatMemberStats` |

### `ChatMemberStats`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `DisplayName` | `string` |
| `MessageCount` | `int` |
| `AvgResponseTimeSeconds` | `float64` |

### `FunAwards`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `NightOwl` | `AwardWinner` |
| `EarlyBird` | `AwardWinner` |
| `LightningResponder` | `AwardWinner` |
| `IcebreakerMonarch` | `AwardWinner` |
| `NovelWriter` | `AwardWinner` |
| `OneWordWonder` | `AwardWinner` |
| `ReactionMagnet` | `AwardWinner` |
| `DynamicDuo` | `DuoWinner` |
| `TopEmojis` | `[]EmojiTally` |

### `AwardWinner`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `DisplayName` | `string` |
| `Badge` | `string` |
| `Description` | `string` |
| `Value` | `string` |

### `DuoWinner`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `User1Name` | `string` |
| `User2Name` | `string` |
| `Description` | `string` |
| `ThreadCount` | `int` |

### `EmojiTally`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `Emoji` | `string` |
| `Count` | `int` |

### `YearWithStovo`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `Year` | `int` |
| `TotalMessages` | `int` |
| `TotalPhotos` | `int` |
| `TotalAudio` | `int` |
| `TotalFiles` | `int` |
| `TotalConversationsStarted` | `int` |
| `BusiestDay` | `string` |
| `BusiestDayMessageCount` | `int` |
| `TopConversationStarterName` | `string` |
| `TopConversationStarts` | `int` |
| `TopEmoji` | `string` |
| `TopEmojiCount` | `int` |
| `PersonalCard` | `PersonalCard` |
| `DynamicDuo` | `DuoWinner` |

### `PersonalCard`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `DisplayName` | `string` |
| `SuperpowerTitle` | `string` |
| `SuperpowerDescription` | `string` |
| `MessagesSent` | `int` |
| `FastRepliesCount` | `int` |
| `AvgResponseTimeSeconds` | `float64` |
| `TopChatTitle` | `string` |

### `PostgresStore`
_Source: `backend/internal/adapters/statsstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |
| `mu` | `sync.RWMutex` |
| `lastChat` | `map[string]lastChatMessage` |

### `PostgresStore`
_Source: `backend/internal/adapters/syncstore/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `PostgresStore`
_Source: `backend/internal/adapters/transcriptionsessions/postgres_store.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |

### `AccountPreferencesHandler`
_Source: `backend/internal/app/account_preferences_handler.go`_

| Field | Type |
| :--- | :--- |
| `inner` | `*httptransport.AccountPreferencesHandler` |

### `EventDeduplicator`
_Source: `backend/internal/app/event_deduplicator.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.Locker` |
| `seen` | `map[string]time.Time` |
| `ttl` | `time.Duration` |
| `now` | `func()` |

### `IntelligenceSourceV2Operations`
_Source: `backend/internal/app/intelligence_source_v2_operations.go`_

| Field | Type |
| :--- | :--- |
| `store` | `*adapterintelligencesourcev2.Store` |
| `now` | `func()` |

### `IntelligenceSourceV2RestoreTombstone`
_Source: `backend/internal/app/intelligence_source_v2_retention.go`_

| Field | Type |
| :--- | :--- |
| `EventID` | `string` |
| `ConnectionID` | `string` |
| `ResourceID` | `string` |
| `RevisionID` | `string` |
| `ChatID` | `string` |
| `Sequence` | `int64` |
| `Reason` | `string` |
| `CreatedAt` | `time.Time` |

### `NotificationDecision`
_Source: `backend/internal/app/notifications.go`_

| Field | Type |
| :--- | :--- |
| `ShouldNotify` | `bool` |
| `Priority` | `int` |
| `Reason` | `string` |

### `SessionRegistry`
_Source: `backend/internal/app/session_registry.go`_

| Field | Type |
| :--- | :--- |
| `runtime` | `*workruntime.LiveSessionRegistry` |
| `mu` | `sync.RWMutex` |
| `sockets` | `map[string]trackedSocket` |

### `NavTabsConfig`
_Source: `backend/internal/app/types.go`_

| Field | Type |
| :--- | :--- |
| `Chats` | `bool` |
| `Storage` | `bool` |
| `Plans` | `bool` |
| `Settings` | `bool` |

### `UnfurlResponse`
_Source: `backend/internal/app/unfurl_operations.go`_

| Field | Type |
| :--- | :--- |
| `URL` | `string` |
| `Title` | `string` |
| `Description` | `string` |
| `Image` | `string` |
| `SiteName` | `string` |
| `Favicon` | `string` |
| `MediaType` | `string` |

### `RedisBroker`
_Source: `backend/internal/broker/redis.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*redis.Client` |

### `RedisCache`
_Source: `backend/internal/cache/redis.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*redis.Client` |

### `PresenceService`
_Source: `backend/internal/cache/services.go`_

| Field | Type |
| :--- | :--- |
| `cache` | `CachingService` |

### `TypingService`
_Source: `backend/internal/cache/services.go`_

| Field | Type |
| :--- | :--- |
| `cache` | `CachingService` |

### `RateLimitExceededError`
_Source: `backend/internal/cache/services.go`_

| Field | Type |
| :--- | :--- |
| `Message` | `string` |

### `RateLimitService`
_Source: `backend/internal/cache/services.go`_

| Field | Type |
| :--- | :--- |
| `cache` | `CachingService` |

### `IntelligenceOIDCSigningPublicKey`
_Source: `backend/internal/config/intelligence_oidc_config.go`_

| Field | Type |
| :--- | :--- |
| `KeyID` | `string` |
| `PublicKeyPEM` | `string` |

### `ScreenConfig`
_Source: `backend/internal/config/profiles.go`_

| Field | Type |
| :--- | :--- |
| `Chats` | `bool` |
| `MediaGallery` | `bool` |
| `VoiceRooms` | `bool` |
| `GameActivity` | `bool` |
| `AuditLogs` | `bool` |
| `MemberInvites` | `bool` |
| `SSOManagement` | `bool` |

### `FeatureMatrix`
_Source: `backend/internal/config/profiles.go`_

| Field | Type |
| :--- | :--- |
| `Profile` | `SolutionProfile` |
| `DisplayName` | `string` |
| `Screens` | `ScreenConfig` |
| `PresenceDetailLevel` | `string` |
| `EndToEndEncryption` | `bool` |
| `CustomEmojis` | `bool` |
| `FileUploadLimitMB` | `int` |
| `DefaultTheme` | `string` |
| `AllowPublicInvites` | `bool` |
| `RequireSSOAuth` | `bool` |

### `CallChat`
_Source: `backend/internal/domain/call.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Type` | `ChatType` |
| `Members` | `[]string` |

### `CallParticipant`
_Source: `backend/internal/domain/call.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `Role` | `ParticipantRole` |

### `CallInitiation`
_Source: `backend/internal/domain/call.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `CallerUserID` | `string` |
| `CallType` | `CallType` |
| `Participants` | `[]CallParticipant` |
| `StartsActive` | `bool` |

### `Member`
_Source: `backend/internal/domain/message.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |

### `Chat`
_Source: `backend/internal/domain/message.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Type` | `string` |
| `CommentsEnabled` | `bool` |
| `CreatedBy` | `*string` |
| `Members` | `[]Member` |

### `Sender`
_Source: `backend/internal/domain/message.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Role` | `string` |

### `SendMessage`
_Source: `backend/internal/domain/message.go`_

| Field | Type |
| :--- | :--- |
| `ReplyToMessageID` | `*string` |
| `ThreadRootMessageID` | `*string` |

### `MessageCreated`
_Source: `backend/internal/domain/message.go`_

| Field | Type |
| :--- | :--- |
| `EventID` | `string` |
| `ChatID` | `string` |
| `MessageID` | `string` |
| `Payload` | `map[string]any` |

### `MessageNotification`
_Source: `backend/internal/domain/message.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `ChatType` | `string` |
| `ChatTitle` | `*string` |
| `SenderID` | `string` |
| `SenderName` | `string` |
| `Preview` | `string` |
| `MentionedUserIDs` | `[]string` |
| `NotifyInForeground` | `bool` |

### `Client`
_Source: `backend/internal/fcm/client.go`_

| Field | Type |
| :--- | :--- |
| `messaging` | `*messaging.Client` |

### `NotificationProviderService`
_Source: `backend/internal/features/administration/notification_provider.go`_

| Field | Type |
| :--- | :--- |
| `store` | `NotificationProviderStore` |

### `PublicURLs`
_Source: `backend/internal/features/administration/public_access.go`_

| Field | Type |
| :--- | :--- |
| `AppURL` | `*string` |
| `APIURL` | `*string` |

### `PublicAccessService`
_Source: `backend/internal/features/administration/public_access.go`_

| Field | Type |
| :--- | :--- |
| `store` | `PublicAccessStore` |

### `EncryptionService`
_Source: `backend/internal/features/administration/public_access.go`_

| Field | Type |
| :--- | :--- |
| `store` | `EncryptionStore` |
| `now` | `func()` |

### `Session`
_Source: `backend/internal/features/calls/service.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `ChatID,` |
| `CreatedAt` | `time.Time` |

### `Participant`
_Source: `backend/internal/features/calls/service.go`_

| Field | Type |
| :--- | :--- |
| `RoomID,` | `UserID,` |
| `JoinedAt` | `*time.Time` |

### `HistoryRecord`
_Source: `backend/internal/features/calls/service.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `ChatID,` |

### `PersistenceService`
_Source: `backend/internal/features/calls/service.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SessionStore` |

### `StartInput`
_Source: `backend/internal/features/calls/service.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `CallerUserID` | `string` |
| `CallType` | `string` |
| `InviteUserIDs` | `[]string` |

### `Service`
_Source: `backend/internal/features/calls/service.go`_

| Field | Type |
| :--- | :--- |
| `chats` | `ChatReader` |
| `privacy` | `DirectPrivacyChecker` |
| `active` | `ActiveCallReader` |

### `Member`
_Source: `backend/internal/features/chats/archive.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `DisplayName,` |
| `PublicKey,` | `LastSeenAt,` |
| `AvatarMode,` | `AvatarSymbolID,` |

### `MessagePreview`
_Source: `backend/internal/features/chats/archive.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `SenderID,` |
| `SenderName` | `*string` |
| `Content` | `*string` |
| `EncryptionProtocol` | `string` |
| `Ciphertext,` | `Nonce` |
| `AttachmentCount` | `int` |

### `ArchiveService`
_Source: `backend/internal/features/chats/archive.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ArchiveStore` |

### `CreateChat`
_Source: `backend/internal/features/chats/creation.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `Title` | `*string` |
| `CommentsEnabled` | `*bool` |
| `MemberIDs` | `[]string` |
| `CreatePreferences` | `bool` |

### `AddMembers`
_Source: `backend/internal/features/chats/creation.go`_

| Field | Type |
| :--- | :--- |
| `ChatID,` | `CreatedAt` |
| `UserIDs` | `[]string` |

### `CreationService`
_Source: `backend/internal/features/chats/creation.go`_

| Field | Type |
| :--- | :--- |
| `store` | `CreationStore` |

### `ChatDetails`
_Source: `backend/internal/features/chats/queries.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `Title,` | `Description,` |
| `AvatarMode,` | `AvatarSymbolID,` |
| `CreatedAt,` | `UpdatedAt,` |
| `CommentsEnabled` | `bool` |
| `MessageDelaySeconds` | `int` |
| `Preference` | `*ChatPreference` |

### `ChatPreference`
_Source: `backend/internal/features/chats/queries.go`_

| Field | Type |
| :--- | :--- |
| `IsMuted,` | `IsPinned,` |
| `MutedUntil` | `*time.Time` |
| `QuietHoursEnabled` | `bool` |
| `QuietHoursStart` | `*string` |
| `QuietHoursEnd` | `*string` |
| `NotificationMode` | `string` |
| `NotifySenderIDs` | `[]string` |
| `AlwaysNotifyMentions` | `bool` |
| `WallpaperFileID` | `*string` |

### `QueryService`
_Source: `backend/internal/features/chats/queries.go`_

| Field | Type |
| :--- | :--- |
| `store` | `QueryStore` |

### `Pin`
_Source: `backend/internal/features/chats/settings.go`_

| Field | Type |
| :--- | :--- |
| `ChatID,` | `MessageID,` |
| `PinnedAt` | `time.Time` |

### `PinsService`
_Source: `backend/internal/features/chats/settings.go`_

| Field | Type |
| :--- | :--- |
| `store` | `PinStore` |
| `now` | `Clock` |

### `AvatarChoices`
_Source: `backend/internal/features/chats/settings.go`_

| Field | Type |
| :--- | :--- |
| `Mode,` | `SymbolID,` |

### `MessageDelay`
_Source: `backend/internal/features/chats/settings.go`_

| Field | Type |
| :--- | :--- |
| `Seconds` | `int` |
| `UpdatedAt` | `string` |

### `Preferences`
_Source: `backend/internal/features/chats/settings.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `UserID` | `string` |
| `IsMuted` | `*bool` |
| `MutedUntil` | `*time.Time` |
| `ClearMutedUntil` | `bool` |
| `QuietHoursEnabled` | `*bool` |
| `QuietHoursStart` | `*string` |
| `QuietHoursEnd` | `*string` |
| `NotificationMode` | `*string` |
| `NotifySenderIDs` | `*[]string` |
| `AlwaysNotifyMentions` | `*bool` |
| `IsPinned` | `*bool` |
| `IsFavorite` | `*bool` |
| `WallpaperFileID` | `*string` |
| `ClearWallpaper` | `bool` |

### `SettingsService`
_Source: `backend/internal/features/chats/settings.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SettingsStore` |
| `now` | `Clock` |

### `Source`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `ProviderID` | `string` |
| `ProfileID` | `string` |

### `Conversation`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `SourceID` | `string` |
| `Title` | `string` |
| `Metadata` | `map[string]any` |

### `Participant`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `SourceID` | `string` |
| `DisplayName` | `string` |
| `Attributes` | `map[string]string` |

### `Reaction`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `Emoji` | `string` |
| `ParticipantIDs` | `[]string` |

### `Message`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `SourceID` | `string` |
| `AuthorID` | `string` |
| `Timestamp` | `time.Time` |
| `Kind` | `string` |
| `Text` | `*string` |
| `ReplyToSourceID` | `string` |
| `ThreadRootSourceID` | `string` |
| `AttachmentIDs` | `[]string` |
| `Reactions` | `[]Reaction` |
| `IsEdited` | `bool` |
| `DeletedAt` | `*time.Time` |
| `Metadata` | `map[string]any` |

### `Attachment`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Path` | `string` |
| `Filename` | `string` |
| `MIMEType` | `string` |
| `Size` | `int64` |
| `Checksum` | `string` |
| `Bytes` | `[]byte` |
| `ExternalURL` | `string` |

### `Warning`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `Code` | `string` |
| `Message` | `string` |

### `Archive`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `int` |
| `Source` | `Source` |
| `ExportedAt` | `*time.Time` |
| `Conversation` | `Conversation` |
| `Conversations` | `[]Conversation` |
| `Participants` | `[]Participant` |
| `Messages` | `[]Message` |
| `Attachments` | `[]Attachment` |
| `Warnings` | `[]Warning` |

### `ValidationError`
_Source: `backend/internal/features/chattransfer/archive.go`_

| Field | Type |
| :--- | :--- |
| `Code` | `string` |
| `Message` | `string` |

### `ImportRequest`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID` | `string` |
| `ImportingUserID` | `string` |
| `IdempotencyKey` | `string` |
| `Archive` | `Archive` |
| `Encryption` | `string` |
| `PreparedContent` | `map[string]StoredMessageContent` |

### `StoredMessageContent`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `Content` | `*string` |
| `Ciphertext` | `*string` |
| `Nonce` | `*string` |
| `EncryptionMetadata` | `*string` |

### `ImportResult`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `CreatedAt` | `string` |
| `Replayed` | `bool` |

### `ImportedChat`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `MemberIDs` | `[]string` |

### `ImportedMessage`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `SourceMessageID,` |
| `Type,` | `Content,` |
| `Ciphertext,` | `Nonce,` |
| `ReplyToMessageID,` | `ThreadRootMessageID` |
| `IsEdited` | `bool` |
| `SourceDeletedAt` | `*string` |
| `SourceReactions` | `json.RawMessage` |
| `SourceMetadata` | `json.RawMessage` |
| `SourceAttachments` | `json.RawMessage` |
| `AttachmentFileIDs` | `[]string` |

### `ImportedFile`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `SourceAttachmentID,` |
| `AccessScope,` | `StorageProvider,` |
| `Size` | `int` |
| `Checksum` | `*string` |

### `ImportCommit`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `BatchID,` | `FamilyID,` |
| `SourceProvider,` | `SourceProfile,` |
| `Chat` | `ImportedChat` |
| `Messages` | `[]ImportedMessage` |
| `Files` | `[]ImportedFile` |

### `ImportService`
_Source: `backend/internal/features/chattransfer/import.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ImportStore` |
| `objects` | `ImportObjectStore` |
| `now` | `func()` |
| `newID` | `func()` |

### `MemberDefaults`
_Source: `backend/internal/features/family/defaults.go`_

| Field | Type |
| :--- | :--- |
| `ProfileVisibility` | `string` |
| `LastSeenVisibility` | `string` |
| `ReadReceiptsEnabled` | `bool` |
| `NotificationSettings` | `string` |

### `MemberDefaultsPatch`
_Source: `backend/internal/features/family/defaults.go`_

| Field | Type |
| :--- | :--- |
| `ProfileVisibility` | `*string` |
| `LastSeenVisibility` | `*string` |
| `ReadReceiptsEnabled` | `*bool` |
| `NotificationSettings` | `*string` |

### `DefaultsService`
_Source: `backend/internal/features/family/defaults.go`_

| Field | Type |
| :--- | :--- |
| `store` | `MemberDefaultsStore` |

### `MembershipService`
_Source: `backend/internal/features/family/defaults.go`_

| Field | Type |
| :--- | :--- |
| `store` | `MembershipStore` |

### `InviteCreate`
_Source: `backend/internal/features/family/invites.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `ExpiresAt` | `time.Time` |
| `MaxUses` | `int` |
| `CreatedAt` | `string` |

### `InviteService`
_Source: `backend/internal/features/family/invites.go`_

| Field | Type |
| :--- | :--- |
| `store` | `InviteStore` |

### `InviteAcceptance`
_Source: `backend/internal/features/family/invites.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `FamilyID,` |
| `InviteID` | `string` |
| `RefreshTokenID,` | `TokenHash,` |
| `ProfileVisibility,` | `LastSeenVisibility` |
| `ReadReceiptsEnabled` | `bool` |

### `ProfilePatch`
_Source: `backend/internal/features/family/profile.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `*string` |
| `StorageLimitMB` | `*int64` |
| `MinimizedChatLayout` | `*bool` |
| `UpdatedAt` | `string` |

### `ProfileService`
_Source: `backend/internal/features/family/profile.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ProfileStore` |

### `Member`
_Source: `backend/internal/features/family/queries.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `IsActive` | `bool` |
| `PublicKey,` | `LastSeenAt` |
| `ProfileVisibility,` | `LastSeenVisibility` |
| `ReadReceiptsEnabled` | `bool` |
| `Email,` | `Bio,` |
| `AvatarMode,` | `AvatarSymbolID,` |
| `CreatedAt` | `string` |
| `AudioCallSettings` | `*string` |

### `Invite`
_Source: `backend/internal/features/family/queries.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `ExpiresAt,` | `CreatedAt` |
| `MaxUses,` | `UsedCount` |
| `RevokedAt` | `*time.Time` |

### `Details`
_Source: `backend/internal/features/family/queries.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `Name,` |
| `StorageLimitMB` | `*int64` |
| `MinimizedChatLayout` | `bool` |
| `PublicAppURL,` | `PublicAPIURL` |

### `QueryService`
_Source: `backend/internal/features/family/queries.go`_

| Field | Type |
| :--- | :--- |
| `store` | `QueryStore` |

### `AccessRecord`
_Source: `backend/internal/features/files/access.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `UploadedBy` | `string` |
| `ChatID` | `*string` |
| `ChatTitle` | `*string` |
| `ChatType` | `*string` |
| `OriginMessageID` | `*string` |
| `AccessScope` | `string` |
| `StorageProvider` | `string` |
| `ObjectKey` | `string` |
| `ThumbnailObjectKey` | `*string` |
| `OriginalName` | `string` |
| `MimeType` | `string` |
| `SizeBytes` | `int64` |
| `Checksum` | `*string` |
| `CreatedAt` | `string` |
| `DeletedAt` | `*string` |
| `IsFavorite` | `bool` |

### `AccessService`
_Source: `backend/internal/features/files/access.go`_

| Field | Type |
| :--- | :--- |
| `store` | `AccessStore` |

### `CloneMetadata`
_Source: `backend/internal/features/files/clones.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `ThumbnailObjectKey` | `*string` |
| `SizeBytes` | `int64` |
| `Checksum` | `*string` |

### `CloneService`
_Source: `backend/internal/features/files/clones.go`_

| Field | Type |
| :--- | :--- |
| `store` | `CloneStore` |

### `ListingService`
_Source: `backend/internal/features/files/listing.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ListingStore` |

### `ReservationRequest`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `OriginalName` | `string` |
| `MIMEType` | `string` |
| `SizeBytes` | `int64` |
| `Checksum` | `*string` |
| `ChatID` | `string` |

### `DirectUpload`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `UploadID` | `string` |
| `FileID` | `string` |
| `ObjectKey` | `string` |
| `ExpectedMIME` | `string` |
| `ExpectedBytes` | `int64` |
| `ExpectedSHA256` | `*string` |
| `State` | `string` |
| `ExpiresAt` | `time.Time` |

### `FavoriteChange`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `FileID,` | `UserID,` |
| `IsFavorite` | `bool` |

### `PreferenceService`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `store` | `PreferenceStore` |

### `Deletion`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `FileID,` | `FamilyID` |
| `ChatID` | `*string` |

### `DeletionService`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `store` | `DeletionStore` |

### `LegacyUpload`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `FileID,` | `FamilyID,` |
| `ChatID` | `*string` |
| `AccessScope` | `string` |
| `StorageProvider` | `string` |
| `ObjectKey` | `string` |
| `ThumbnailObjectKey` | `*string` |
| `OriginalName` | `string` |
| `MIMEType` | `string` |
| `SizeBytes` | `int64` |
| `Checksum` | `string` |
| `CreatedAt` | `time.Time` |

### `LegacyUploadService`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `store` | `LegacyUploadStore` |

### `ReserveUploadInput`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `Upload` | `DirectUpload` |
| `FamilyID` | `string` |
| `UserID` | `string` |
| `ChatID` | `*string` |
| `AccessScope` | `string` |
| `StorageProvider` | `string` |
| `OriginalName` | `string` |
| `Checksum` | `*string` |
| `IdempotencyKey` | `string` |
| `RequestHash` | `string` |
| `CreatedAt` | `time.Time` |

### `CompleteUploadInput`
_Source: `backend/internal/features/files/metadata.go`_

| Field | Type |
| :--- | :--- |
| `UploadID` | `string` |
| `UserID` | `string` |
| `FamilyID` | `string` |
| `ObjectETag` | `string` |
| `Now` | `time.Time` |

### `ValidationUpload`
_Source: `backend/internal/features/files/validation.go`_

| Field | Type |
| :--- | :--- |
| `UploadID,` | `FileID,` |
| `ChatID` | `*string` |
| `ExpectedBytes` | `int64` |
| `ExpectedChecksum` | `*string` |

### `ValidationReady`
_Source: `backend/internal/features/files/validation.go`_

| Field | Type |
| :--- | :--- |
| `Upload` | `ValidationUpload` |
| `EventID,` | `DetectedMIME,` |

### `ValidationRejected`
_Source: `backend/internal/features/files/validation.go`_

| Field | Type |
| :--- | :--- |
| `UploadID,` | `FileID,` |

### `Lifecycle`
_Source: `backend/internal/features/files/validation.go`_

| Field | Type |
| :--- | :--- |
| `State` | `string` |
| `ObjectRevision` | `*string` |

### `LifecycleService`
_Source: `backend/internal/features/files/validation.go`_

| Field | Type |
| :--- | :--- |
| `store` | `LifecycleStore` |

### `ValidationService`
_Source: `backend/internal/features/files/validation.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ValidationStore` |

### `AuthMethodCeremony`
_Source: `backend/internal/features/identity/auth_methods.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID,` | `UserID,` |
| `SessionData` | `[]byte` |

### `AndroidQRLoginGrant`
_Source: `backend/internal/features/identity/auth_methods.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID,` | `UserID` |
| `ExpiresAt` | `time.Time` |

### `QRLoginRecord`
_Source: `backend/internal/features/identity/auth_methods.go`_

| Field | Type |
| :--- | :--- |
| `Status,` | `ApprovedUserID` |
| `ExpiresAt` | `time.Time` |

### `PasskeyInviteAcceptance`
_Source: `backend/internal/features/identity/auth_methods.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `FamilyID,` |
| `InviteID,` | `FamilyChatID,` |
| `CredentialRecordID,` | `RefreshTokenID,` |
| `RefreshExpiresAt,` | `CreatedAt,` |
| `ProfileVisibility,` | `LastSeenVisibility` |
| `ReadReceiptsEnabled` | `bool` |

### `LoginAccount`
_Source: `backend/internal/features/identity/login.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `IsActive` | `bool` |
| `PublicKey,` | `ProfilePhotoFileID` |
| `AvatarMode,` | `AvatarSymbolID,` |
| `CreatedAt` | `string` |
| `LastSeenAt` | `*string` |
| `ProfileVisibility,` | `LastSeenVisibility` |
| `ReadReceiptsEnabled` | `bool` |
| `AudioCallSettings,` | `Email,` |

### `LoginAccountService`
_Source: `backend/internal/features/identity/login.go`_

| Field | Type |
| :--- | :--- |
| `store` | `LoginAccountStore` |

### `Registration`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `FamilyName` | `string` |
| `Nickname` | `string` |
| `Username` | `string` |
| `DisplayName` | `string` |

### `SessionToken`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `Raw` | `string` |
| `Hash` | `string` |
| `ExpiresAt` | `string` |

### `PersistedSession`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `UserID,` |

### `RotatedSession`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `OldTokenHash` | `string` |
| `New` | `PersistedSession` |
| `RevokedAt` | `string` |

### `PasswordChange`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `PasswordHash,` |

### `ProfilePatch`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `DisplayName` | `*string` |
| `PublicKey` | `*string` |
| `ProfilePhotoFileID` | `*string` |
| `ClearProfilePhoto` | `bool` |
| `ProfileVisibility` | `*string` |
| `LastSeenVisibility` | `*string` |
| `ReadReceiptsEnabled` | `*bool` |
| `Email` | `*string` |
| `Bio` | `*string` |
| `Timezone` | `*string` |
| `AvatarMode` | `*string` |
| `AvatarSymbolID` | `*string` |
| `AvatarColorID` | `*string` |

### `ProfileService`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ProfileStore` |

### `RefreshSession`
_Source: `backend/internal/features/identity/registration.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `ExpiresAt` | `string` |
| `Revoked` | `bool` |

### `SetupCommand`
_Source: `backend/internal/features/identity/setup.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID,` | `FamilyName,` |
| `Role,` | `ChatID,` |
| `CreatedAt,` | `IPAddress` |

### `SetupService`
_Source: `backend/internal/features/identity/setup.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SetupStore` |

### `SetupStatus`
_Source: `backend/internal/features/identity/setup_status.go`_

| Field | Type |
| :--- | :--- |
| `ActiveUserCount` | `int` |
| `FamilyName` | `*string` |

### `SetupStatusService`
_Source: `backend/internal/features/identity/setup_status.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SetupStatusStore` |

### `AuditRecord`
_Source: `backend/internal/features/mcp/audit.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `ChatID,` | `MessageID,` |
| `Success` | `bool` |
| `Meta` | `json.RawMessage` |

### `AuditEvent`
_Source: `backend/internal/features/mcp/audit.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `ConnectorID,` |
| `ChatID,` | `MessageID,` |
| `Success` | `bool` |
| `Meta` | `json.RawMessage` |
| `CreatedAt` | `time.Time` |

### `AuditService`
_Source: `backend/internal/features/mcp/audit.go`_

| Field | Type |
| :--- | :--- |
| `store` | `AuditStore` |

### `Connector`
_Source: `backend/internal/features/mcp/connectors.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `Enabled` | `bool` |
| `RevokedAt,` | `LastUsedAt` |
| `MaxHistoryMessages` | `int` |
| `Permissions` | `map[string]bool` |
| `Provider,` | `Alias,` |

### `ConnectorCreate`
_Source: `backend/internal/features/mcp/connectors.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `TokenHash,` | `CreatedBy,` |
| `MaxHistoryMessages` | `int` |
| `Permissions` | `map[string]bool` |
| `ChatIDs` | `[]string` |

### `ConnectorUpdate`
_Source: `backend/internal/features/mcp/connectors.go`_

| Field | Type |
| :--- | :--- |
| `ConnectorID,` | `FamilyID,` |
| `Enabled` | `bool` |
| `MaxHistoryMessages` | `int` |
| `Permissions` | `map[string]bool` |
| `ChatIDs` | `[]string` |

### `ConnectorRevoke`
_Source: `backend/internal/features/mcp/connectors.go`_

| Field | Type |
| :--- | :--- |
| `ConnectorID,` | `FamilyID,` |

### `ConnectorService`
_Source: `backend/internal/features/mcp/connectors.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ConnectorStore` |

### `AttachmentCommand`
_Source: `backend/internal/features/messages/attachments.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `ChatID,` |
| `FileIDs` | `[]string` |

### `AttachmentService`
_Source: `backend/internal/features/messages/attachments.go`_

| Field | Type |
| :--- | :--- |
| `store` | `AttachmentStore` |

### `SlowModeInput`
_Source: `backend/internal/features/messages/delay.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `SenderID` | `string` |
| `DelaySeconds` | `int` |
| `CanManage` | `bool` |

### `SlowModeError`
_Source: `backend/internal/features/messages/delay.go`_

| Field | Type |
| :--- | :--- |
| `RemainingSeconds` | `int` |

### `DelayService`
_Source: `backend/internal/features/messages/delay.go`_

| Field | Type |
| :--- | :--- |
| `store` | `DelayStore` |
| `now` | `func()` |

### `DeliveryService`
_Source: `backend/internal/features/messages/delivery.go`_

| Field | Type |
| :--- | :--- |
| `delivery` | `Delivery` |

### `Detail`
_Source: `backend/internal/features/messages/detail.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `ChatID,` |
| `ChatFound` | `bool` |
| `Content,` | `Ciphertext,` |
| `KeyVersion` | `*int` |
| `ReplyToMessageID,` | `ThreadRootMessageID` |
| `MessageKind` | `string` |
| `ForwardedFromMessageID,` | `ForwardedFromChatID` |
| `CreatedAt,` | `UpdatedAt` |
| `DeletedAt` | `*string` |
| `IsEdited` | `bool` |
| `SenderDisplayName` | `*string` |

### `Status`
_Source: `backend/internal/features/messages/detail.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `Status,` |

### `Reaction`
_Source: `backend/internal/features/messages/detail.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `Emoji` |

### `Sender`
_Source: `backend/internal/features/messages/detail.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `DisplayName` | `*string` |

### `DetailService`
_Source: `backend/internal/features/messages/detail.go`_

| Field | Type |
| :--- | :--- |
| `store` | `DetailStore` |

### `ForwardLookupService`
_Source: `backend/internal/features/messages/forward_lookup.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ForwardLookupStore` |

### `HistoryPage`
_Source: `backend/internal/features/messages/history.go`_

| Field | Type |
| :--- | :--- |
| `ChatID,` | `ViewerID,` |
| `Limit` | `int` |

### `ArchiveGroup`
_Source: `backend/internal/features/messages/history.go`_

| Field | Type |
| :--- | :--- |
| `SourceChatID` | `string` |
| `MessageCount` | `int` |

### `HistoryService`
_Source: `backend/internal/features/messages/history.go`_

| Field | Type |
| :--- | :--- |
| `store` | `HistoryStore` |

### `PlainEdit`
_Source: `backend/internal/features/messages/mutations.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `Content,` |

### `EncryptedEdit`
_Source: `backend/internal/features/messages/mutations.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `Ciphertext,` |
| `KeyVersion` | `int` |

### `Deletion`
_Source: `backend/internal/features/messages/mutations.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `UserID,` |
| `ForUserOnly` | `bool` |

### `MutationService`
_Source: `backend/internal/features/messages/mutations.go`_

| Field | Type |
| :--- | :--- |
| `store` | `MutationStore` |

### `MessageBundle`
_Source: `backend/internal/features/messages/persistence.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `ChatID,` |
| `Content,` | `Ciphertext,` |
| `KeyVersion` | `*int` |
| `ReplyToMessageID,` | `ThreadRootMessageID` |
| `ForwardedFromMessageID,` | `ForwardedFromChatID` |
| `AttachmentFileIDs,` | `DeliveredRecipientIDs` |

### `PersistenceService`
_Source: `backend/internal/features/messages/persistence.go`_

| Field | Type |
| :--- | :--- |
| `store` | `MessagePersistenceStore` |

### `ReactionChange`
_Source: `backend/internal/features/messages/reactions.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `UserID,` |
| `Add` | `bool` |

### `ReactionService`
_Source: `backend/internal/features/messages/reactions.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ReactionStore` |

### `ReadTarget`
_Source: `backend/internal/features/messages/read_state.go`_

| Field | Type |
| :--- | :--- |
| `MessageID,` | `ChatID,` |

### `ReadCommand`
_Source: `backend/internal/features/messages/read_state.go`_

| Field | Type |
| :--- | :--- |
| `Target` | `ReadTarget` |
| `UserID,` | `ReadAt` |

### `ReadService`
_Source: `backend/internal/features/messages/read_state.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ReadStore` |

### `SearchHit`
_Source: `backend/internal/features/messages/search.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |

### `EncryptedSearchCandidate`
_Source: `backend/internal/features/messages/search.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `ChatID,` |

### `SearchService`
_Source: `backend/internal/features/messages/search.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SearchStore` |

### `Service`
_Source: `backend/internal/features/messages/service.go`_

| Field | Type |
| :--- | :--- |
| `authorizer` | `Authorizer` |

### `SyncedMessage`
_Source: `backend/internal/features/messages/synced_create.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `ChatID,` |
| `Content,` | `Ciphertext,` |
| `KeyVersion` | `*int` |
| `ReplyToMessageID,` | `ThreadRootMessageID` |
| `SourceConnectionID,` | `SourceOperationID,` |
| `SourceRevision` | `int64` |
| `SourceContentHash` | `[]byte` |
| `SourceFinal` | `bool` |
| `AttachmentIDs` | `[]string` |
| `CreatedAt` | `time.Time` |

### `CreateSyncedMessage`
_Source: `backend/internal/features/messages/synced_create.go`_

| Field | Type |
| :--- | :--- |
| `ActorID,` | `FamilyID,` |
| `Message` | `SyncedMessage` |
| `OnlineRecipientIDs,` | `RecipientIDs` |
| `ResponsePayload` | `[]byte` |

### `CreateSyncedMessageResult`
_Source: `backend/internal/features/messages/synced_create.go`_

| Field | Type |
| :--- | :--- |
| `ResponsePayload` | `[]byte` |
| `Replayed` | `bool` |

### `SyncedMessageService`
_Source: `backend/internal/features/messages/synced_create.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SyncedMessageStore` |

### `UnreadService`
_Source: `backend/internal/features/messages/unread.go`_

| Field | Type |
| :--- | :--- |
| `store` | `UnreadStore` |

### `Attendee`
_Source: `backend/internal/features/plans/service.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `Status` | `string` |

### `Plan`
_Source: `backend/internal/features/plans/service.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Title` | `string` |
| `Notes` | `*string` |
| `Location` | `*string` |
| `StartsAt` | `time.Time` |
| `EndsAt` | `time.Time` |
| `AllDay` | `bool` |
| `TimeZone` | `string` |
| `Recurrence` | `*string` |
| `CreatedBy` | `string` |
| `CreatorDisplayName` | `string` |
| `SourceChatID` | `*string` |
| `Revision` | `int` |
| `CreatedAt` | `time.Time` |
| `UpdatedAt` | `time.Time` |
| `Attendees` | `[]Attendee` |

### `CreateInput`
_Source: `backend/internal/features/plans/service.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID` | `string` |
| `CreatorID` | `string` |
| `CreatorRole` | `string` |
| `Title` | `string` |
| `Notes` | `*string` |
| `Location` | `*string` |
| `StartsAt` | `time.Time` |
| `EndsAt` | `time.Time` |
| `AllDay` | `bool` |
| `TimeZone` | `string` |
| `Recurrence` | `*string` |
| `SourceChatID` | `*string` |
| `AttendeeUserID` | `[]string` |

### `NewPlan`
_Source: `backend/internal/features/plans/service.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Title` | `string` |
| `Notes` | `*string` |
| `Location` | `*string` |
| `StartsAt` | `time.Time` |
| `EndsAt` | `time.Time` |
| `AllDay` | `bool` |
| `TimeZone` | `string` |
| `Recurrence` | `*string` |
| `CreatedBy` | `string` |
| `SourceChatID` | `*string` |
| `AttendeeUserID` | `[]string` |
| `CreatedAt` | `time.Time` |
| `UpdatedAt` | `time.Time` |

### `Service`
_Source: `backend/internal/features/plans/service.go`_

| Field | Type |
| :--- | :--- |
| `store` | `Store` |
| `now` | `Clock` |
| `newID` | `IDGenerator` |

### `PollOption`
_Source: `backend/internal/features/polls/polls.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `PollID` | `string` |
| `Text` | `string` |
| `OptionIndex` | `int` |

### `Poll`
_Source: `backend/internal/features/polls/polls.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `MessageID` | `string` |
| `Question` | `string` |
| `IsAnonymous` | `bool` |
| `AllowMultiple` | `bool` |
| `IsQuiz` | `bool` |
| `CorrectOptionID` | `*string` |
| `Explanation` | `*string` |
| `IsClosed` | `bool` |
| `CreatedAt` | `string` |
| `ClosedAt` | `*string` |

### `PollVote`
_Source: `backend/internal/features/polls/polls.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `PollID` | `string` |
| `OptionID` | `string` |
| `UserID` | `string` |
| `CreatedAt` | `string` |

### `CreatePollParams`
_Source: `backend/internal/features/polls/polls.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `MessageID` | `string` |
| `Question` | `string` |
| `IsAnonymous` | `bool` |
| `AllowMultiple` | `bool` |
| `IsQuiz` | `bool` |
| `CorrectOptionID` | `*string` |
| `Explanation` | `*string` |
| `CreatedAt` | `string` |
| `Options` | `[]string` |

### `Service`
_Source: `backend/internal/features/polls/polls.go`_

| Field | Type |
| :--- | :--- |
| `store` | `Store` |

### `AudioSettings`
_Source: `backend/internal/features/preferences/service.go`_

| Field | Type |
| :--- | :--- |
| `SpeakerMode` | `string` |
| `InputDeviceID` | `string` |
| `OutputDeviceID` | `string` |
| `EchoCancellation` | `bool` |
| `NoiseSuppression` | `bool` |
| `AutoGainControl` | `bool` |
| `VoiceEnhancement` | `bool` |
| `InputGain` | `float64` |
| `OutputVolume` | `float64` |
| `VoiceEnhancementThreshold` | `float64` |
| `VoiceEnhancementHighpass` | `float64` |
| `Privacy` | `*ContactPrivacy` |

### `ContactPrivacy`
_Source: `backend/internal/features/preferences/service.go`_

| Field | Type |
| :--- | :--- |
| `DirectMessagePermission` | `string` |
| `GroupInvitePermission` | `string` |
| `ChannelInvitePermission` | `string` |
| `VoiceInvitePermission` | `string` |
| `InvitePermissionUserIDs` | `[]string` |

### `ContactPrivacyPatch`
_Source: `backend/internal/features/preferences/service.go`_

| Field | Type |
| :--- | :--- |
| `DirectMessagePermission` | `*string` |
| `GroupInvitePermission` | `*string` |
| `ChannelInvitePermission` | `*string` |
| `VoiceInvitePermission` | `*string` |
| `InvitePermissionUserIDs` | `*[]string` |

### `Service`
_Source: `backend/internal/features/preferences/service.go`_

| Field | Type |
| :--- | :--- |
| `store` | `Store` |
| `newTopic` | `TopicGenerator` |

### `Member`
_Source: `backend/internal/features/privacy/service.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Active` | `bool` |

### `Service`
_Source: `backend/internal/features/privacy/service.go`_

| Field | Type |
| :--- | :--- |
| `store` | `Store` |
| `now` | `Clock` |

### `Role`
_Source: `backend/internal/features/roles/service.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `Name,` |
| `Permissions` | `[]string` |
| `IsDefault` | `bool` |
| `MemberCount` | `int` |

### `CreateCommand`
_Source: `backend/internal/features/roles/service.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |
| `Permissions` | `[]string` |

### `UpdateCommand`
_Source: `backend/internal/features/roles/service.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID,` | `RoleID,` |
| `Permissions` | `[]string` |

### `Service`
_Source: `backend/internal/features/roles/service.go`_

| Field | Type |
| :--- | :--- |
| `store` | `Store` |

### `Actor`
_Source: `backend/internal/features/sync/pagination.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID` | `string` |
| `UserID` | `string` |

### `Event`
_Source: `backend/internal/features/sync/pagination.go`_

| Field | Type |
| :--- | :--- |
| `Sequence` | `int64` |
| `ID` | `string` |
| `Type` | `string` |
| `Version` | `int` |
| `AggregateType` | `string` |
| `AggregateID` | `string` |
| `Payload` | `[]byte` |
| `OccurredAt` | `time.Time` |

### `Page`
_Source: `backend/internal/features/sync/pagination.go`_

| Field | Type |
| :--- | :--- |
| `Events` | `[]Event` |
| `NextCursor` | `string` |
| `HasMore` | `bool` |

### `Service`
_Source: `backend/internal/features/sync/pagination.go`_

| Field | Type |
| :--- | :--- |
| `store` | `Store` |
| `signingKey` | `[]byte` |

### `StartSession`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `SessionID,` | `ChatID,` |
| `StartedAt` | `time.Time` |

### `StopSession`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `CallID,` | `RequestedSessionID` |
| `StoppedAt` | `time.Time` |

### `StatusUpdate`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `SessionID,` | `Status` |
| `StoppedAt,` | `CompletedAt` |

### `MetadataUpdate`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `SessionID` | `string` |
| `SubmittedAudioMs` | `int64` |
| `EstimatedCostUSD` | `float64` |
| `DetectedLanguages` | `[]string` |

### `Failure`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `SessionID,` | `Code,` |

### `AICallNotesClaim`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `SessionID,` | `InitiatedBy,` |
| `Summary` | `Summary` |

### `SessionService`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SessionStore` |

### `AudioChunk`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `SessionID,` |
| `Sequence` | `int` |
| `CallStartMs,` | `CallEndMs,` |
| `ClientVADScore` | `float64` |

### `ChunkService`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `store` | `ChunkStore` |

### `SessionView`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `CallID,` |
| `Status` | `string` |
| `StartedAt,` | `StoppedAt,` |
| `SubmittedAudioMs` | `int64` |
| `EstimatedCostUSD` | `*float64` |
| `FailureCode,` | `FailureMessage` |
| `CreatedAt` | `time.Time` |

### `Segment`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `CallID,` |
| `ParticipantName` | `string` |
| `StartMs,` | `EndMs` |
| `CleanedText,` | `DetectedLanguage` |
| `Confidence` | `*float64` |

### `SegmentWrite`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `CallID,` |
| `StartMs,` | `EndMs` |
| `Confidence` | `float64` |
| `ProviderIndex` | `int` |

### `SegmentService`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `store` | `SegmentStore` |

### `Decision`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `SourceSegmentIDs` | `[]string` |

### `ActionItem`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `AssigneeParticipantID` | `*string` |
| `DueDate` | `*string` |
| `SourceSegmentIDs` | `[]string` |

### `OpenQuestion`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `SourceSegmentIDs` | `[]string` |

### `Summary`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `Summary` | `string` |
| `Decisions` | `[]Decision` |
| `ActionItems` | `[]ActionItem` |
| `OpenQuestions` | `[]OpenQuestion` |

### `Transcript`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `Session` | `SessionView` |
| `Segments` | `[]Segment` |
| `Summary` | `*Summary` |

### `Artifact`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `ObjectKey,` | `ContentType` |

### `QueryService`
_Source: `backend/internal/features/transcription/sessions.go`_

| Field | Type |
| :--- | :--- |
| `store` | `QueryStore` |

### `Record`
_Source: `backend/internal/logging/logging.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `int64` |
| `Timestamp` | `time.Time` |
| `Level` | `string` |
| `LevelNo` | `int` |
| `Logger` | `string` |
| `Message` | `string` |
| `Module` | `string` |
| `FunctionName` | `string` |
| `LineNo` | `int` |
| `Exception` | `*string` |

### `Buffer`
_Source: `backend/internal/logging/logging.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.RWMutex` |
| `limit` | `int` |
| `records` | `[]Record` |
| `nextID` | `atomic.Int64` |
| `logFile` | `*os.File` |
| `archive` | `*archiveSink` |

### `Logger`
_Source: `backend/internal/logging/logging.go`_

| Field | Type |
| :--- | :--- |
| `buffer` | `*Buffer` |

### `Config`
_Source: `backend/internal/ocisecret/adapter.go`_

| Field | Type |
| :--- | :--- |
| `Reader` | `SecretReader` |
| `SecretOCID` | `string` |
| `AllowlistKeys` | `[]string` |
| `AuthToken` | `string` |
| `Timeout` | `time.Duration` |

### `Adapter`
_Source: `backend/internal/ocisecret/adapter.go`_

| Field | Type |
| :--- | :--- |
| `cfg` | `Config` |
| `allowlist` | `map[string]bool` |
| `cacheMu` | `sync.RWMutex` |
| `cache` | `map[int64]map[string]string` |

### `MasterLock`
_Source: `backend/internal/orchestrator/lock.go`_

| Field | Type |
| :--- | :--- |
| `db` | `*sql.DB` |
| `fencingToken` | `atomic.Int64` |

### `TenantRolloutStatus`
_Source: `backend/internal/orchestrator/orchestrator.go`_

| Field | Type |
| :--- | :--- |
| `Slug` | `string` |
| `Status` | `string` |
| `Image` | `string` |
| `Error` | `string` |

### `RolloutStatus`
_Source: `backend/internal/orchestrator/orchestrator.go`_

| Field | Type |
| :--- | :--- |
| `ReleaseID` | `string` |
| `DesiredImage` | `string` |
| `Phase` | `string` |
| `Completed` | `bool` |
| `Tenants` | `map[string]TenantRolloutStatus` |

### `Orchestrator`
_Source: `backend/internal/orchestrator/orchestrator.go`_

| Field | Type |
| :--- | :--- |
| `dockerClient` | `*client.Client` |
| `masterDB` | `*sql.DB` |
| `rolloutMu` | `sync.RWMutex` |
| `rolloutStatus` | `RolloutStatus` |

### `NavTabsConfig`
_Source: `backend/internal/orchestrator/routes.go`_

| Field | Type |
| :--- | :--- |
| `Chats` | `bool` |
| `Storage` | `bool` |
| `Plans` | `bool` |
| `Settings` | `bool` |

### `ChatTypesConfig`
_Source: `backend/internal/orchestrator/routes.go`_

| Field | Type |
| :--- | :--- |
| `Direct` | `bool` |
| `Group` | `bool` |
| `Channel` | `bool` |
| `Voice` | `bool` |

### `ServerRecord`
_Source: `backend/internal/orchestrator/routes.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `int` |
| `Slug` | `string` |
| `Name` | `string` |
| `CreatedAt` | `time.Time` |
| `Status` | `string` |
| `NavTabs` | `NavTabsConfig` |
| `ChatTypes` | `ChatTypesConfig` |
| `PublicPreview` | `bool` |

### `BotPlugin`
_Source: `backend/internal/plugins/builtins/bot_plugin.go`_

| Field | Type |
| :--- | :--- |
| `welcomeCount` | `int` |

### `CanvasPlugin`
_Source: `backend/internal/plugins/builtins/canvas_plugin.go`_

| Field | Type |
| :--- | :--- |
| `store` | `*statsstore.PostgresStore` |
| `enabled` | `atomic.Bool` |

### `ChecklistPlugin`
_Source: `backend/internal/plugins/builtins/checklist_plugin.go`_

| Field | Type |
| :--- | :--- |
| `store` | `*statsstore.PostgresStore` |
| `enabled` | `atomic.Bool` |

### `StatsPlugin`
_Source: `backend/internal/plugins/builtins/stats_plugin.go`_

| Field | Type |
| :--- | :--- |
| `store` | `*statsstore.PostgresStore` |
| `enabled` | `atomic.Bool` |

### `ThemePackPlugin`
_Source: `backend/internal/plugins/builtins/theme_plugin.go`_

| Field | Type |
| :--- | :--- |
| `availableThemes` | `[]string` |

### `MemoryEventBus`
_Source: `backend/internal/plugins/eventbus.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.RWMutex` |
| `subscribers` | `map[EventType][]EventHandler` |

### `Event`
_Source: `backend/internal/plugins/plugin.go`_

| Field | Type |
| :--- | :--- |
| `Type` | `EventType` |
| `Timestamp` | `time.Time` |
| `Payload` | `map[string]interface{` |

### `Services`
_Source: `backend/internal/plugins/plugin.go`_

| Field | Type |
| :--- | :--- |
| `Config` | `*config.Config` |
| `EventBus` | `EventBus` |
| `StatsStore` | `any` |

### `Status`
_Source: `backend/internal/plugins/plugin.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Name` | `string` |
| `Enabled` | `bool` |

### `PluginRegistry`
_Source: `backend/internal/plugins/plugin.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.RWMutex` |
| `plugins` | `map[string]Plugin` |

### `ObjectInfo`
_Source: `backend/internal/ports/object_store.go`_

| Field | Type |
| :--- | :--- |
| `Size` | `int64` |
| `ContentType` | `string` |
| `ETag` | `string` |

### `ChatNotificationPreference`
_Source: `backend/internal/ports/user_preferences.go`_

| Field | Type |
| :--- | :--- |
| `IsMuted` | `bool` |
| `MutedUntil` | `*time.Time` |
| `QuietHoursEnabled` | `bool` |
| `QuietHoursStart` | `string` |
| `QuietHoursEnd` | `string` |
| `NotificationMode` | `string` |
| `NotifySenderIDs` | `[]string` |
| `AlwaysNotifyMentions` | `bool` |

### `SetupParams`
_Source: `backend/internal/repository/auth.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID` | `string` |
| `FamilyName` | `string` |
| `UserID` | `string` |
| `Username` | `string` |
| `PasswordHash` | `string` |
| `DisplayName` | `string` |
| `Role` | `string` |
| `ChatID` | `string` |
| `ChatTitle` | `string` |
| `RefreshTokenID` | `string` |
| `TokenHash` | `string` |
| `ExpiresAt` | `string` |
| `CreatedAt` | `string` |
| `IPAddress` | `string` |

### `CreateRefreshTokenParams`
_Source: `backend/internal/repository/auth.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `UserID` | `string` |
| `TokenHash` | `string` |
| `ExpiresAt` | `string` |
| `CreatedAt` | `string` |
| `IPAddress` | `string` |

### `RotateRefreshTokenParams`
_Source: `backend/internal/repository/auth.go`_

| Field | Type |
| :--- | :--- |
| `OldTokenHash` | `string` |
| `NewID` | `string` |
| `UserID` | `string` |
| `NewTokenHash` | `string` |
| `NewExpiresAt` | `string` |
| `CreatedAt` | `string` |
| `IPAddress` | `string` |
| `RevokedAt` | `string` |

### `UpdateUserProfileParams`
_Source: `backend/internal/repository/auth.go`_

| Field | Type |
| :--- | :--- |
| `DisplayName` | `*string` |
| `PublicKey` | `*string` |
| `ProfilePhotoFileID` | `*string` |
| `ClearProfilePhoto` | `bool` |
| `ProfileVisibility` | `*string` |
| `LastSeenVisibility` | `*string` |
| `ReadReceiptsEnabled` | `*bool` |
| `Email` | `*string` |
| `Bio` | `*string` |
| `Timezone` | `*string` |
| `AvatarMode` | `*string` |
| `AvatarSymbolID` | `*string` |
| `AvatarColorID` | `*string` |

### `CreateCallSessionParams`
_Source: `backend/internal/repository/calls.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `CallerID` | `string` |
| `CalleeID` | `string` |
| `CallType` | `string` |
| `Topology` | `string` |
| `State` | `string` |
| `CreatedAt` | `time.Time` |

### `UpsertCallParticipantParams`
_Source: `backend/internal/repository/calls.go`_

| Field | Type |
| :--- | :--- |
| `RoomID` | `string` |
| `UserID` | `string` |
| `Role` | `string` |
| `State` | `string` |
| `JoinedAt` | `*time.Time` |

### `RecordCallHistoryParams`
_Source: `backend/internal/repository/calls.go`_

| Field | Type |
| :--- | :--- |
| `MessageID` | `string` |
| `ChatID` | `string` |
| `SenderID` | `string` |
| `EncryptionMetadata` | `string` |
| `CreatedAt` | `string` |
| `UpdatedAt` | `string` |

### `CreateChatParams`
_Source: `backend/internal/repository/chats.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Type` | `string` |
| `Title` | `*string` |
| `CreatedBy` | `string` |
| `MediaVisibility` | `string` |
| `CommentsEnabled` | `*bool` |
| `EncryptionProtocol` | `string` |
| `CreatedAt` | `string` |
| `MemberIDs` | `[]string` |
| `CreatePreferences` | `bool` |

### `AddChatMembersParams`
_Source: `backend/internal/repository/chats.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `UserIDs` | `[]string` |
| `CreatedAt` | `string` |

### `UpdateChatPreferencesParams`
_Source: `backend/internal/repository/chats.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `UserID` | `string` |
| `IsMuted` | `*bool` |
| `MutedUntil` | `*time.Time` |
| `ClearMutedUntil` | `bool` |
| `QuietHoursEnabled` | `*bool` |
| `QuietHoursStart` | `*string` |
| `QuietHoursEnd` | `*string` |
| `NotificationMode` | `*string` |
| `NotifySenderIDs` | `*[]string` |
| `AlwaysNotifyMentions` | `*bool` |
| `IsPinned` | `*bool` |
| `IsFavorite` | `*bool` |
| `WallpaperFileID` | `*string` |
| `ClearWallpaper` | `bool` |

### `ChatForMember`
_Source: `backend/internal/repository/chats.go`_

| Field | Type |
| :--- | :--- |
| `Chat` | `*ent.Chat` |
| `Preference` | `*ent.ChatPreference` |

### `LastMessagePreview`
_Source: `backend/internal/repository/chats.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `SenderID` | `string` |
| `SenderName` | `*string` |
| `Type` | `string` |
| `Content` | `*string` |
| `EncryptionProtocol` | `string` |
| `Ciphertext` | `*string` |
| `Nonce` | `*string` |
| `CreatedAt` | `string` |
| `AttachmentCount` | `int` |

### `UpdateFamilyParams`
_Source: `backend/internal/repository/family.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `*string` |
| `StorageLimitMB` | `*int64` |
| `MinimizedChatLayout` | `*bool` |
| `UpdatedAt` | `string` |

### `CreateInviteParams`
_Source: `backend/internal/repository/family.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `TokenHash` | `string` |
| `Role` | `string` |
| `ExpiresAt` | `string` |
| `MaxUses` | `int` |
| `CreatedBy` | `string` |
| `CreatedAt` | `string` |

### `AcceptInviteParams`
_Source: `backend/internal/repository/family.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `FamilyID` | `string` |
| `Username` | `string` |
| `PasswordHash` | `string` |
| `DisplayName` | `string` |
| `Role` | `string` |
| `InviteID` | `string` |
| `FamilyChatID` | `string` |
| `RefreshTokenID` | `string` |
| `TokenHash` | `string` |
| `ExpiresAt` | `string` |
| `CreatedAt` | `string` |
| `IPAddress` | `string` |
| `ProfileVisibility` | `string` |
| `LastSeenVisibility` | `string` |
| `ReadReceiptsEnabled` | `bool` |

### `CreateFileParams`
_Source: `backend/internal/repository/files.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `UploadedBy` | `string` |
| `ChatID` | `*string` |
| `AccessScope` | `string` |
| `StorageProvider` | `string` |
| `ObjectKey` | `string` |
| `ThumbnailObjectKey` | `*string` |
| `OriginalName` | `string` |
| `MimeType` | `string` |
| `SizeBytes` | `int` |
| `Checksum` | `*string` |
| `CreatedAt` | `string` |

### `FileDetail`
_Source: `backend/internal/repository/files.go`_

| Field | Type |
| :--- | :--- |
| `File` | `*ent.File` |
| `ChatTitle` | `*string` |
| `ChatType` | `*string` |
| `OriginMessageID` | `*string` |
| `IsFavorite` | `bool` |

### `CreateMCPConnectorActorUserParams`
_Source: `backend/internal/repository/mcp.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Username` | `string` |
| `PasswordHash` | `string` |
| `DisplayName` | `string` |
| `Role` | `string` |
| `CreatedAt` | `string` |

### `CreateMCPConnectorParams`
_Source: `backend/internal/repository/mcp.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Name` | `string` |
| `ActorUserID` | `string` |
| `TokenHash` | `string` |
| `CreatedBy` | `string` |
| `CreatedAt` | `string` |
| `MaxHistoryMessages` | `int` |
| `Permissions` | `string` |
| `Provider` | `string` |
| `Alias` | `string` |
| `AuthMode` | `string` |

### `UpdateMCPConnectorParams`
_Source: `backend/internal/repository/mcp.go`_

| Field | Type |
| :--- | :--- |
| `ConnectorID` | `string` |
| `FamilyID` | `string` |
| `Name` | `string` |
| `Enabled` | `bool` |
| `MaxHistoryMessages` | `int` |
| `Permissions` | `string` |
| `Alias` | `string` |
| `AuthMode` | `string` |

### `RevokeMCPConnectorParams`
_Source: `backend/internal/repository/mcp.go`_

| Field | Type |
| :--- | :--- |
| `ConnectorID` | `string` |
| `FamilyID` | `string` |
| `RevokedAt` | `string` |
| `TokenHash` | `string` |
| `DisplayName` | `string` |
| `ActorUserID` | `string` |

### `InsertMCPAuditEventParams`
_Source: `backend/internal/repository/mcp.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `ConnectorID` | `string` |
| `ActorUserID` | `string` |
| `Action` | `string` |
| `ChatID` | `*string` |
| `MessageID` | `*string` |
| `Success` | `bool` |
| `Error` | `*string` |
| `Meta` | `string` |
| `CreatedAt` | `string` |

### `ListMessageIDsPageParams`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `ViewerID` | `string` |
| `BeforeCreatedAt` | `string` |
| `ThreadRootMessageID` | `string` |
| `ArchiveGroup` | `string` |
| `Limit` | `int` |

### `ArchiveMessageGroup`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `SourceChatID` | `string` |
| `Count` | `int` |

### `ActiveMessageMeta`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `SenderID` | `string` |
| `CreatedAt` | `string` |

### `CreateMessageBundleParams`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `MessageID` | `string` |
| `ChatID` | `string` |
| `SenderID` | `string` |
| `Type` | `string` |
| `Content` | `*string` |
| `EncryptionProtocol` | `string` |
| `Ciphertext` | `*string` |
| `Nonce` | `*string` |
| `KeyVersion` | `*int` |
| `EncryptionMetadata` | `*string` |
| `ReplyToMessageID` | `*string` |
| `ThreadRootMessageID` | `*string` |
| `MessageKind` | `string` |
| `ForwardedFromMessageID` | `*string` |
| `ForwardedFromChatID` | `*string` |
| `CreatedAt` | `string` |
| `AttachmentFileIDs` | `[]string` |
| `DeliveredRecipientIDs` | `[]string` |

### `UpdateMessageEncryptedContentParams`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `MessageID` | `string` |
| `Ciphertext` | `string` |
| `Nonce` | `string` |
| `KeyVersion` | `int` |
| `EncryptionMetadata` | `string` |
| `UpdatedAt` | `string` |

### `MessageSearchHit`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |

### `EncryptedMessageSearchCandidate`
_Source: `backend/internal/repository/messages.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `Ciphertext` | `string` |
| `Nonce` | `string` |
| `FamilyID` | `string` |

### `CreatePlanParams`
_Source: `backend/internal/repository/plans.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Title` | `string` |
| `Notes` | `*string` |
| `Location` | `*string` |
| `StartsAt` | `string` |
| `EndsAt` | `string` |
| `AllDay` | `bool` |
| `TimeZone` | `string` |
| `Recurrence` | `*string` |
| `CreatedBy` | `string` |
| `SourceChatID` | `*string` |
| `CreatedAt` | `string` |
| `UpdatedAt` | `string` |

### `CreatePollParams`
_Source: `backend/internal/repository/polls.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `MessageID` | `string` |
| `Question` | `string` |
| `IsAnonymous` | `bool` |
| `AllowMultiple` | `bool` |
| `IsQuiz` | `bool` |
| `CorrectOptionID` | `*string` |
| `Explanation` | `*string` |
| `CreatedAt` | `string` |
| `Options` | `[]string` |

### `Store`
_Source: `backend/internal/repository/store.go`_

| Field | Type |
| :--- | :--- |
| `Client` | `*ent.Client` |

### `CallConflict`
_Source: `backend/internal/runtime/call_index.go`_

| Field | Type |
| :--- | :--- |
| `Kind` | `CallConflictKind` |
| `UserID` | `string` |

### `CallParticipant`
_Source: `backend/internal/runtime/call_session.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `Role` | `string` |
| `State` | `CallParticipantState` |
| `JoinedAt` | `time.Time` |

### `CallSession`
_Source: `backend/internal/runtime/call_session.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `CallerUserID` | `string` |
| `CalleeUserID` | `string` |
| `CallType` | `string` |
| `Topology` | `CallTopology` |
| `State` | `CallState` |
| `Participants` | `map[string]*CallParticipant` |
| `CreatedAt` | `time.Time` |
| `ConnectedAt` | `time.Time` |
| `ExpiresAt` | `time.Time` |

### `CallTimeout`
_Source: `backend/internal/runtime/call_timeout.go`_

| Field | Type |
| :--- | :--- |
| `ExpiresAt` | `time.Time` |
| `Run` | `func(context.Context)` |

### `JobMessage`
_Source: `backend/internal/runtime/job_consumer.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `EventID,` |

### `Lifecycle`
_Source: `backend/internal/runtime/lifecycle.go`_

| Field | Type |
| :--- | :--- |
| `ctx` | `context.Context` |
| `cancel` | `context.CancelFunc` |
| `wg` | `sync.WaitGroup` |

### `LiveSessionRegistry`
_Source: `backend/internal/runtime/live_sessions.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.RWMutex` |
| `sessions` | `map[string]liveSession` |
| `userSockets` | `map[string]map[string]any` |

### `NtfyPayload`
_Source: `backend/internal/runtime/notification_delivery.go`_

| Field | Type |
| :--- | :--- |
| `Topic` | `string` |
| `Title` | `string` |
| `Message` | `string` |
| `Priority` | `int` |
| `Tags` | `[]string` |
| `Click` | `string` |

### `NtfyRetryItem`
_Source: `backend/internal/runtime/notification_delivery.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `Payload` | `NtfyPayload` |
| `Attempt` | `int` |

### `NtfyRetryWorkerOptions`
_Source: `backend/internal/runtime/notification_delivery.go`_

| Field | Type |
| :--- | :--- |
| `Deliver` | `func(context.Context,` |
| `Succeeded` | `func(item` |
| `Exhausted` | `func(item` |

### `OutboxEvent`
_Source: `backend/internal/runtime/outbox.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `Topic,` |
| `SchemaVersion` | `int` |
| `Payload` | `[]byte` |

### `PendingWork`
_Source: `backend/internal/runtime/pending_work.go`_

| Field | Type |
| :--- | :--- |
| `InitialDelay` | `time.Duration` |
| `PollInterval` | `time.Duration` |
| `MaxPolls` | `int` |
| `Pending` | `func(context.Context)` |
| `Run` | `func(context.Context)` |

### `ShutdownDependencies`
_Source: `backend/internal/runtime/shutdown.go`_

| Field | Type |
| :--- | :--- |
| `CancelRealtime` | `func()` |
| `WaitRealtime` | `func()` |
| `Sockets` | `io.Closer` |
| `Redis` | `io.Closer` |
| `JobsRedis` | `io.Closer` |
| `LogBuffer` | `io.Closer` |
| `Persistence` | `io.Closer` |
| `Database` | `io.Closer` |

### `TranscriptionProcessingJob`
_Source: `backend/internal/runtime/transcription_processing.go`_

| Field | Type |
| :--- | :--- |
| `SessionID` | `string` |
| `CallID` | `string` |
| `ChatID` | `string` |

### `TranscriptionProviderOptions`
_Source: `backend/internal/runtime/transcription_processor.go`_

| Field | Type |
| :--- | :--- |
| `APIKey` | `string` |
| `BaseURL` | `string` |
| `STTModel` | `string` |
| `ChatModel` | `string` |
| `CostPerAudioHour` | `float64` |

### `TranscriptionProcessor`
_Source: `backend/internal/runtime/transcription_processor.go`_

| Field | Type |
| :--- | :--- |
| `Sessions` | `*featuretranscription.SessionService` |
| `Chunks` | `*featuretranscription.ChunkService` |
| `Segments` | `*featuretranscription.SegmentService` |
| `Storage` | `ports.ObjectStore` |
| `CallsBucket` | `string` |
| `Provider` | `TranscriptionProviderOptions` |
| `DisableNotes` | `bool` |
| `ParticipantName` | `func(string)` |
| `Logger` | `TranscriptionProcessorLogger` |
| `Broadcast` | `func(chatID,` |
| `Publish` | `func(context.Context,` |

### `FileValidationRunner`
_Source: `backend/internal/runtime/worker.go`_

| Field | Type |
| :--- | :--- |
| `StreamName` | `string` |
| `GroupName` | `string` |
| `ConsumerID` | `string` |
| `BlockTime` | `time.Duration` |
| `BatchSize` | `int` |
| `JobConsumer` | `JobConsumer` |
| `ProcessJob` | `func(ctx` |
| `Report` | `func(err` |

### `LocalStorage`
_Source: `backend/internal/storage/local.go`_

| Field | Type |
| :--- | :--- |
| `root` | `string` |

### `MinIOStorage`
_Source: `backend/internal/storage/minio.go`_

| Field | Type |
| :--- | :--- |
| `client` | `*minio.Client` |
| `presignClient` | `*minio.Client` |
| `bucket` | `string` |
| `accessKey` | `string` |
| `secretKey` | `string` |
| `provider` | `string` |
| `fallback` | `ObjectStore` |

### `Config`
_Source: `backend/internal/storage/storage.go`_

| Field | Type |
| :--- | :--- |
| `Provider` | `string` |
| `LocalPath` | `string` |
| `Endpoint` | `string` |
| `AccessKey` | `string` |
| `SecretKey` | `string` |
| `Secure` | `bool` |
| `PublicEndpoint` | `string` |
| `PublicSecure` | `bool` |
| `Bucket` | `string` |

### `AudioSegment`
_Source: `backend/internal/transcription/chunker.go`_

| Field | Type |
| :--- | :--- |
| `Data` | `[]byte` |
| `Filename` | `string` |
| `ContentType` | `string` |
| `OffsetSec` | `float64` |

### `GroqWordTimestamp`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `Word` | `string` |
| `Start` | `float64` |
| `End` | `float64` |

### `GroqSegment`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `int` |
| `Text` | `string` |
| `Start` | `float64` |
| `End` | `float64` |
| `Language` | `string` |
| `Words` | `[]GroqWordTimestamp` |
| `AvgLogProb` | `float64` |
| `CompressionRatio` | `float64` |
| `NoSpeechProb` | `float64` |
| `Temperature` | `float64` |

### `GroqTranscriptionResponse`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `Language` | `string` |
| `Duration` | `float64` |
| `Segments` | `[]GroqSegment` |
| `Words` | `[]GroqWordTimestamp` |

### `GroqSTTConfig`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `APIKey` | `string` |
| `Model` | `string` |
| `BaseURL` | `string` |
| `TimeoutSeconds` | `int` |
| `MaxConcurrency` | `int` |
| `CostPerAudioHour` | `float64` |

### `GroqSTTClient`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `cfg` | `GroqSTTConfig` |
| `client` | `*http.Client` |

### `TranscribeRequest`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `AudioData` | `[]byte` |
| `Filename` | `string` |
| `ContentType` | `string` |

### `TransientError`
_Source: `backend/internal/transcription/groq.go`_

| Field | Type |
| :--- | :--- |
| `Err` | `error` |

### `LLMConfig`
_Source: `backend/internal/transcription/llm.go`_

| Field | Type |
| :--- | :--- |
| `APIKey` | `string` |
| `Model` | `string` |
| `BaseURL` | `string` |

### `LLMClient`
_Source: `backend/internal/transcription/llm.go`_

| Field | Type |
| :--- | :--- |
| `cfg` | `LLMConfig` |
| `client` | `*http.Client` |

### `Session`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `CallID` | `string` |
| `InitiatedBy` | `string` |
| `Status` | `SessionStatus` |
| `Provider` | `string` |
| `ProviderModel` | `string` |
| `StartedAt` | `*time.Time` |
| `StoppedAt` | `*time.Time` |
| `CompletedAt` | `*time.Time` |
| `SubmittedAudioMs` | `int64` |
| `EstimatedCostUSD` | `*float64` |
| `DetectedLanguages` | `[]string` |
| `FailureCode` | `*string` |
| `FailureMessage` | `*string` |
| `CreatedAt` | `time.Time` |
| `UpdatedAt` | `time.Time` |

### `TranscriptSegment`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `CallID` | `string` |
| `SessionID` | `string` |
| `ParticipantID` | `string` |
| `ParticipantName` | `string` |
| `StartMs` | `int64` |
| `EndMs` | `int64` |
| `ExactText` | `string` |
| `CleanedText` | `*string` |
| `DetectedLanguage` | `*string` |
| `Confidence` | `*float64` |
| `PackageID` | `*string` |

### `UploadChunkResult`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `ChunkID` | `string` |
| `ObjectKey` | `string` |
| `Valid` | `bool` |
| `StatusMsg` | `string` |

### `TranscriptSegmentForLLM`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `CallID` | `string` |
| `SessionID` | `string` |
| `ParticipantID` | `string` |
| `ParticipantName` | `string` |
| `StartMs` | `int64` |
| `EndMs` | `int64` |
| `Text` | `string` |
| `Language` | `string` |
| `Confidence` | `float64` |

### `DecisionItem`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `SourceSegmentIDs` | `[]string` |

### `ActionItem`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `AssigneeParticipantID` | `*string` |
| `DueDate` | `*string` |
| `SourceSegmentIDs` | `[]string` |

### `OpenQuestion`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `Text` | `string` |
| `SourceSegmentIDs` | `[]string` |

### `PostProcessingResult`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `Summary` | `string` |
| `Decisions` | `[]DecisionItem` |
| `ActionItems` | `[]ActionItem` |
| `OpenQuestions` | `[]OpenQuestion` |

### `PackageRegion`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `PackedStartMs` | `int64` |
| `PackedEndMs` | `int64` |
| `CallStartMs` | `int64` |
| `CallEndMs` | `int64` |

### `SpeechRegion`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `CallStartMs` | `int64` |
| `CallEndMs` | `int64` |
| `DurationMs` | `int64` |

### `SpeechPackage`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `PackageID` | `string` |
| `ParticipantID` | `string` |
| `Regions` | `[]PackageRegion` |
| `TotalDurationMs` | `int64` |

### `VTTSegment`
_Source: `backend/internal/transcription/types.go`_

| Field | Type |
| :--- | :--- |
| `StartMs` | `int64` |
| `EndMs` | `int64` |
| `SpeakerName` | `string` |
| `Text` | `string` |

### `AccountPreferencesHandler`
_Source: `backend/internal/transport/http/account_preferences_handler.go`_

| Field | Type |
| :--- | :--- |
| `preferences` | `*featurepreferences.Service` |
| `appURL` | `string` |
| `decodeJSON` | `func(*http.Request,` |

### `DeviceTokenPayload`
_Source: `backend/internal/transport/http/account_preferences_handler.go`_

| Field | Type |
| :--- | :--- |
| `Token` | `string` |

### `AdminLogRecord`
_Source: `backend/internal/transport/http/admin_logs.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `int64` |
| `Timestamp` | `time.Time` |
| `Level` | `string` |
| `LevelNo` | `int` |
| `Logger` | `string` |
| `Message` | `string` |
| `Module` | `string` |
| `FunctionName` | `string` |
| `LineNo` | `int` |
| `Exception` | `*string` |

### `AdminLogsDependencies`
_Source: `backend/internal/transport/http/admin_logs.go`_

| Field | Type |
| :--- | :--- |
| `Authorize` | `func(*stdhttp.Request)` |
| `Records` | `func()` |

### `NotificationProviderOperations`
_Source: `backend/internal/transport/http/admin_notification_provider.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func(AdminActor)` |
| `Get` | `func(context.Context)` |
| `Set` | `func(context.Context,` |

### `AdminNotificationProviderHandler`
_Source: `backend/internal/transport/http/admin_notification_provider.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `NotificationProviderOperations` |

### `AdminHTTPError`
_Source: `backend/internal/transport/http/admin_public_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `Status` | `int` |
| `Detail` | `string` |

### `AdminActor`
_Source: `backend/internal/transport/http/admin_public_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID,` | `FamilyID,` |

### `DomainLinkPayload`
_Source: `backend/internal/transport/http/admin_public_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `Domain` | `string` |
| `APIDomain` | `*string` |

### `AdminPublicAccessOperations`
_Source: `backend/internal/transport/http/admin_public_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func(AdminActor)` |
| `Get` | `func(context.Context,` |
| `Update` | `func(context.Context,` |
| `Suggestions` | `func(context.Context,` |
| `Check` | `func(context.Context,` |
| `GetEncryption` | `func(context.Context,` |
| `UpdateEncryption` | `func(context.Context,` |
| `TunnelStatus` | `func(context.Context,` |
| `TunnelStart` | `func(context.Context,` |
| `TunnelStop` | `func(context.Context,` |
| `DomainLink` | `func(context.Context,` |
| `QuickStart` | `func(context.Context,` |
| `PublicIPQuickStart` | `func(context.Context,` |

### `AdminPublicAccessHandler`
_Source: `backend/internal/transport/http/admin_public_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `AdminPublicAccessOperations` |

### `CallRoutes`
_Source: `backend/internal/transport/http/call_routes.go`_

| Field | Type |
| :--- | :--- |
| `GetICEServers` | `stdhttp.Handler` |
| `CreateSFUToken` | `stdhttp.Handler` |
| `StartTranscription` | `stdhttp.Handler` |
| `StopTranscription` | `stdhttp.Handler` |
| `GetTranscriptionStatus` | `stdhttp.Handler` |
| `GetTranscript` | `stdhttp.Handler` |
| `RequestTranscriptionUpload` | `stdhttp.Handler` |
| `UploadAudioChunkData` | `stdhttp.Handler` |
| `CompleteTranscriptionUpload` | `stdhttp.Handler` |
| `UpdateTranscriptSegment` | `stdhttp.Handler` |
| `GetTranscriptArtifact` | `stdhttp.Handler` |
| `StartRecording` | `stdhttp.Handler` |
| `StopRecording` | `stdhttp.Handler` |
| `GetRecordingStatus` | `stdhttp.Handler` |
| `UploadRecording` | `stdhttp.Handler` |
| `FailRecording` | `stdhttp.Handler` |
| `TranscribeCaptions` | `stdhttp.Handler` |

### `ChatCreateRequest`
_Source: `backend/internal/transport/http/chat_mutation_handler.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `Title` | `string` |
| `MemberIDs` | `[]string` |

### `ChatUpdateRequest`
_Source: `backend/internal/transport/http/chat_mutation_handler.go`_

| Field | Type |
| :--- | :--- |
| `Title` | `*string` |
| `Description` | `*string` |
| `MediaVisibility` | `*string` |
| `ChatPhotoFileID` | `*string` |
| `CommentsEnabled` | `*bool` |
| `PinPermission` | `*string` |
| `MessageDelaySeconds` | `*int` |
| `AvatarMode` | `*string` |
| `AvatarSymbolID` | `*string` |
| `AvatarColorID` | `*string` |

### `ChatPreferencesRequest`
_Source: `backend/internal/transport/http/chat_mutation_handler.go`_

| Field | Type |
| :--- | :--- |
| `IsMuted` | `*bool` |
| `MutedUntil` | `*time.Time` |
| `ClearMutedUntil` | `bool` |
| `QuietHoursEnabled` | `*bool` |
| `QuietHoursStart` | `*string` |
| `QuietHoursEnd` | `*string` |
| `NotificationMode` | `*string` |
| `NotifySenderIDs` | `*[]string` |
| `AlwaysNotifyMentions` | `*bool` |
| `IsPinned` | `*bool` |
| `IsFavorite` | `*bool` |
| `WallpaperFileID` | `*string` |

### `ChatMutationOperations`
_Source: `backend/internal/transport/http/chat_mutation_handler.go`_

| Field | Type |
| :--- | :--- |
| `Create` | `func(context.Context,` |
| `Update` | `func(context.Context,` |
| `AddMembers` | `func(context.Context,` |
| `Preferences` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `ChatMutationHandler`
_Source: `backend/internal/transport/http/chat_mutation_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `ChatMutationOperations` |

### `ChatReadOperations`
_Source: `backend/internal/transport/http/chat_read_handlers.go`_

| Field | Type |
| :--- | :--- |
| `List` | `func(context.Context)` |
| `Get` | `func(context.Context,` |
| `IsMissing` | `func(error)` |
| `LogError` | `func(operation` |

### `ChatReadHandler`
_Source: `backend/internal/transport/http/chat_read_handlers.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `ChatReadOperations` |

### `ChatTransferOperations`
_Source: `backend/internal/transport/http/chat_transfer_handler.go`_

| Field | Type |
| :--- | :--- |
| `ExportSource` | `func(context.Context,` |
| `Import` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `ChatTransferHandler`
_Source: `backend/internal/transport/http/chat_transfer_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `ChatTransferOperations` |

### `CoreHandlerDependencies`
_Source: `backend/internal/transport/http/core_handlers.go`_

| Field | Type |
| :--- | :--- |
| `AppName` | `string` |
| `Environment` | `string` |
| `Version` | `string` |
| `DatabaseHealth` | `func(context.Context)` |
| `RedisHealth` | `func(context.Context)` |

### `CoreHandlers`
_Source: `backend/internal/transport/http/core_handlers.go`_

| Field | Type |
| :--- | :--- |
| `dependencies` | `CoreHandlerDependencies` |

### `CoreRoutes`
_Source: `backend/internal/transport/http/core_routes.go`_

| Field | Type |
| :--- | :--- |
| `AssetLinks` | `stdhttp.Handler` |
| `Health` | `stdhttp.Handler` |
| `HealthDB` | `stdhttp.Handler` |
| `HealthRedis` | `stdhttp.Handler` |
| `Sync` | `stdhttp.Handler` |
| `Manifest` | `stdhttp.Handler` |

### `DeviceLoginHandler`
_Source: `backend/internal/transport/http/device_login_handler.go`_

| Field | Type |
| :--- | :--- |
| `Request` | `func(context.Context,` |
| `Verify` | `func(context.Context,` |
| `ClientIP` | `func(*stdhttp.Request)` |
| `WriteSuccess` | `func(stdhttp.ResponseWriter,` |

### `FamilyMemberHandler`
_Source: `backend/internal/transport/http/family_member_handlers.go`_

| Field | Type |
| :--- | :--- |
| `List` | `func(context.Context)` |
| `Change` | `func(context.Context,` |
| `Remove` | `func(context.Context,` |
| `AdminDetails` | `func(context.Context,` |
| `BanIP` | `func(context.Context,` |
| `UnbanIP` | `func(context.Context,` |

### `Family`
_Source: `backend/internal/transport/http/family_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Name` | `string` |
| `StorageLimitMB` | `*int64` |
| `MinimizedChatLayout` | `bool` |
| `DefaultMessageEncryptionProtocol` | `string` |
| `DefaultProfileVisibility` | `string` |
| `DefaultLastSeenVisibility` | `string` |
| `DefaultReadReceiptsEnabled` | `bool` |
| `DefaultNotificationSettings` | `string` |
| `TranslationEnabled` | `bool` |
| `CallRecordingEnabled` | `bool` |
| `AINotesEnabled` | `bool` |
| `VoiceTranscriptionEnabled` | `bool` |
| `ScreenShareBitrateKbps` | `int` |
| `CameraBitrateKbps` | `int` |
| `GroupCallScreenShareBitrateKbps` | `int` |
| `GroupCallCameraBitrateKbps` | `int` |
| `DMCallScreenShareBitrateKbps` | `int` |
| `DMCallCameraBitrateKbps` | `int` |
| `NavTabs` | `NavTabs` |

### `NavTabs`
_Source: `backend/internal/transport/http/family_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `Chats` | `bool` |
| `Storage` | `bool` |
| `Plans` | `bool` |
| `Settings` | `bool` |

### `FamilyReadOperations`
_Source: `backend/internal/transport/http/family_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `Load` | `func(context.Context,` |
| `IsNotFound` | `func(error)` |
| `LogError` | `func(operation` |

### `FamilyReadHandler`
_Source: `backend/internal/transport/http/family_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `FamilyReadOperations` |

### `FamilyRoutes`
_Source: `backend/internal/transport/http/family_routes.go`_

| Field | Type |
| :--- | :--- |
| `GetFamily` | `stdhttp.Handler` |
| `UpdateFamily` | `stdhttp.Handler` |
| `GetMembers` | `stdhttp.Handler` |
| `ListRoles` | `stdhttp.Handler` |
| `CreateRole` | `stdhttp.Handler` |
| `UpdateRole` | `stdhttp.Handler` |
| `DeleteRole` | `stdhttp.Handler` |
| `ChangeRole` | `stdhttp.Handler` |
| `RemoveMember` | `stdhttp.Handler` |
| `GetMemberAdminDetails` | `stdhttp.Handler` |
| `BanMemberIP` | `stdhttp.Handler` |
| `UnbanMemberIP` | `stdhttp.Handler` |
| `GetPlans` | `stdhttp.Handler` |
| `CreatePlan` | `stdhttp.Handler` |
| `RSVPToPlan` | `stdhttp.Handler` |

### `InviteRoutes`
_Source: `backend/internal/transport/http/family_routes.go`_

| Field | Type |
| :--- | :--- |
| `CreateInvite` | `stdhttp.Handler` |
| `PreviewInvite` | `stdhttp.Handler` |
| `AcceptInvite` | `stdhttp.Handler` |
| `PasskeyOptions` | `stdhttp.Handler` |
| `AcceptPasskey` | `stdhttp.Handler` |
| `DeleteInvite` | `stdhttp.Handler` |

### `FamilyUpdateRequest`
_Source: `backend/internal/transport/http/family_update_handler.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `*string` |
| `StorageLimitMB` | `*int64` |
| `MinimizedChatLayout` | `*bool` |
| `DefaultProfileVisibility` | `*string` |
| `DefaultLastSeenVisibility` | `*string` |
| `DefaultReadReceiptsEnabled` | `*bool` |
| `DefaultNotificationSettings` | `*string` |
| `TranslationEnabled` | `*bool` |
| `CallRecordingEnabled` | `*bool` |
| `AINotesEnabled` | `*bool` |
| `VoiceTranscriptionEnabled` | `*bool` |
| `ScreenShareBitrateKbps` | `*int` |
| `CameraBitrateKbps` | `*int` |
| `GroupCallScreenShareBitrateKbps` | `*int` |
| `GroupCallCameraBitrateKbps` | `*int` |
| `DMCallScreenShareBitrateKbps` | `*int` |
| `DMCallCameraBitrateKbps` | `*int` |

### `FamilyUpdateActor`
_Source: `backend/internal/transport/http/family_update_handler.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID` | `string` |
| `Role` | `string` |
| `Permissions` | `[]string` |

### `FamilyUpdateOperations`
_Source: `backend/internal/transport/http/family_update_handler.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func(FamilyUpdateActor)` |
| `IsOwner` | `func(FamilyUpdateActor)` |
| `Update` | `func(context.Context,` |
| `ValidVisibility` | `func(*string,` |
| `ValidNotificationSettings` | `func(string)` |

### `FamilyUpdateHandler`
_Source: `backend/internal/transport/http/family_update_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `FamilyUpdateOperations` |

### `FileAccessOperations`
_Source: `backend/internal/transport/http/file_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `Create` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `FileAccessHandler`
_Source: `backend/internal/transport/http/file_access_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `FileAccessOperations` |

### `FileDelivery`
_Source: `backend/internal/transport/http/file_delivery_handler.go`_

| Field | Type |
| :--- | :--- |
| `Data` | `[]byte` |
| `ContentType` | `string` |
| `OriginalName` | `string` |

### `FileDeliveryOperations`
_Source: `backend/internal/transport/http/file_delivery_handler.go`_

| Field | Type |
| :--- | :--- |
| `Download` | `func(context.Context,` |
| `Thumbnail` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `FileDeliveryHandler`
_Source: `backend/internal/transport/http/file_delivery_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `FileDeliveryOperations` |

### `FileListItem`
_Source: `backend/internal/transport/http/file_list_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `UploadedBy` | `string` |
| `ChatID` | `*string` |
| `ChatTitle` | `*string` |
| `ChatType` | `*string` |
| `OriginMessageID` | `*string` |
| `AccessScope` | `string` |
| `StorageProvider` | `string` |
| `ThumbnailObjectKey` | `*string` |
| `OriginalName` | `string` |
| `MimeType` | `string` |
| `SizeBytes` | `int64` |
| `Checksum` | `*string` |
| `CreatedAt` | `time.Time` |
| `DeletedAt` | `*time.Time` |
| `IsFavorite` | `bool` |

### `FileListOperations`
_Source: `backend/internal/transport/http/file_list_handler.go`_

| Field | Type |
| :--- | :--- |
| `List` | `func(context.Context)` |

### `FileListHandler`
_Source: `backend/internal/transport/http/file_list_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `FileListOperations` |

### `FileMutationHandler`
_Source: `backend/internal/transport/http/file_mutation_handler.go`_

| Field | Type |
| :--- | :--- |
| `SetFavorite` | `func(context.Context,` |
| `Delete` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `ReserveDirectFileUploadRequest`
_Source: `backend/internal/transport/http/file_presenters.go`_

| Field | Type |
| :--- | :--- |
| `OriginalName` | `string` |
| `MimeType` | `string` |
| `SizeBytes` | `int64` |
| `Checksum` | `*string` |
| `ChatID` | `*string` |

### `DirectFileUploadResponse`
_Source: `backend/internal/transport/http/file_presenters.go`_

| Field | Type |
| :--- | :--- |
| `UploadID` | `string` |
| `FileID` | `string` |
| `State` | `string` |
| `UploadURL` | `*string` |
| `ExpiresAt` | `*time.Time` |
| `ExpectedMIME` | `string` |
| `ExpectedBytes` | `int64` |

### `DirectFileAccessResponse`
_Source: `backend/internal/transport/http/file_presenters.go`_

| Field | Type |
| :--- | :--- |
| `FileID` | `string` |
| `Revision` | `*string` |
| `URL` | `string` |
| `ExpiresAt` | `time.Time` |
| `MimeType` | `string` |
| `SizeBytes` | `int64` |
| `Checksum` | `*string` |

### `MediaPlaybackTokenResponse`
_Source: `backend/internal/transport/http/file_presenters.go`_

| Field | Type |
| :--- | :--- |
| `Token` | `string` |
| `ExpiresAt` | `time.Time` |

### `FileTranscriptResponse`
_Source: `backend/internal/transport/http/file_presenters.go`_

| Field | Type |
| :--- | :--- |
| `FileID` | `string` |
| `Text` | `string` |
| `Language` | `*string` |
| `Duration` | `*float64` |

### `DirectUploadReadOperations`
_Source: `backend/internal/transport/http/file_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `Load` | `func(context.Context,` |

### `DirectUploadReadHandler`
_Source: `backend/internal/transport/http/file_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `DirectUploadReadOperations` |

### `FileDetailOperations`
_Source: `backend/internal/transport/http/file_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `Get` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `FileDetailHandler`
_Source: `backend/internal/transport/http/file_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `FileDetailOperations` |

### `FileRoutes`
_Source: `backend/internal/transport/http/file_routes.go`_

| Field | Type |
| :--- | :--- |
| `Upload` | `stdhttp.Handler` |
| `ReserveDirectUpload` | `stdhttp.Handler` |
| `GetDirectUpload` | `stdhttp.Handler` |
| `CompleteDirectUpload` | `stdhttp.Handler` |
| `List` | `stdhttp.Handler` |
| `Get` | `stdhttp.Handler` |
| `CreateDirectAccess` | `stdhttp.Handler` |
| `Download` | `stdhttp.Handler` |
| `Thumbnail` | `stdhttp.Handler` |
| `CreatePlaybackToken` | `stdhttp.Handler` |
| `UpdatePreferences` | `stdhttp.Handler` |
| `Transcribe` | `stdhttp.Handler` |
| `GetTranscript` | `stdhttp.Handler` |
| `Delete` | `stdhttp.Handler` |
| `StreamMedia` | `stdhttp.Handler` |
| `Collections` | `stdhttp.Handler` |

### `FileTranscriptionHandler`
_Source: `backend/internal/transport/http/file_transcription_handler.go`_

| Field | Type |
| :--- | :--- |
| `Transcribe` | `func(context.Context,` |
| `Get` | `func(context.Context,` |

### `DirectUploadOperations`
_Source: `backend/internal/transport/http/file_upload_handler.go`_

| Field | Type |
| :--- | :--- |
| `Reserve` | `func(ctx` |
| `Complete` | `func(ctx` |

### `DirectUploadHandler`
_Source: `backend/internal/transport/http/file_upload_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `DirectUploadOperations` |

### `MultipartUploadInput`
_Source: `backend/internal/transport/http/file_upload_handler.go`_

| Field | Type |
| :--- | :--- |
| `Filename` | `string` |
| `ContentType` | `string` |
| `ChatID` | `string` |
| `Data` | `[]byte` |

### `FileUploadOperations`
_Source: `backend/internal/transport/http/file_upload_handler.go`_

| Field | Type |
| :--- | :--- |
| `Upload` | `func(ctx` |

### `FileUploadHandler`
_Source: `backend/internal/transport/http/file_upload_handler.go`_

| Field | Type |
| :--- | :--- |
| `maxUploadSizeBytes` | `int64` |
| `operations` | `FileUploadOperations` |

### `ICEServer`
_Source: `backend/internal/transport/http/ice_handler.go`_

| Field | Type |
| :--- | :--- |
| `URLs` | `[]string` |
| `Username` | `string` |
| `Credential` | `string` |

### `ICEServerResponse`
_Source: `backend/internal/transport/http/ice_handler.go`_

| Field | Type |
| :--- | :--- |
| `ICEServers` | `[]ICEServer` |

### `ICEServerActor`
_Source: `backend/internal/transport/http/ice_handler.go`_

| Field | Type |
| :--- | :--- |
| `UserID,` | `FamilyID` |

### `ICEServerOperations`
_Source: `backend/internal/transport/http/ice_handler.go`_

| Field | Type |
| :--- | :--- |
| `Resolve` | `func(context.Context,` |

### `ICEServerHandler`
_Source: `backend/internal/transport/http/ice_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `ICEServerOperations` |

### `IntelligenceOIDCAuthorizationRequest`
_Source: `backend/internal/transport/http/intelligence_oidc_handler.go`_

| Field | Type |
| :--- | :--- |
| `ResponseType` | `string` |
| `ClientID` | `string` |
| `RedirectURI` | `string` |
| `State` | `string` |
| `Nonce` | `string` |
| `CodeChallenge` | `string` |
| `CodeChallengeMethod` | `string` |

### `IntelligenceOIDCAuthorizationResult`
_Source: `backend/internal/transport/http/intelligence_oidc_handler.go`_

| Field | Type |
| :--- | :--- |
| `RedirectURI` | `string` |
| `Code` | `string` |
| `State` | `string` |

### `IntelligenceOIDCTokenResponse`
_Source: `backend/internal/transport/http/intelligence_oidc_handler.go`_

| Field | Type |
| :--- | :--- |
| `AccessToken` | `string` |
| `TokenType` | `string` |
| `ExpiresIn` | `int64` |
| `IDToken` | `string` |

### `IntelligenceOIDCOperations`
_Source: `backend/internal/transport/http/intelligence_oidc_handler.go`_

| Field | Type |
| :--- | :--- |
| `ValidateAuthorization` | `func(context.Context,` |
| `Authorize` | `func(context.Context,` |
| `AuthorizeBrowser` | `func(context.Context,` |
| `Exchange` | `func(context.Context,` |

### `IntelligenceOIDCHandlerConfig`
_Source: `backend/internal/transport/http/intelligence_oidc_handler.go`_

| Field | Type |
| :--- | :--- |
| `Enabled` | `bool` |
| `BrowserAppURL` | `string` |
| `Discovery` | `any` |
| `JWKS` | `any` |
| `Operations` | `IntelligenceOIDCOperations` |
| `Timeout` | `time.Duration` |

### `IntelligenceOIDCHandler`
_Source: `backend/internal/transport/http/intelligence_oidc_handler.go`_

| Field | Type |
| :--- | :--- |
| `config` | `IntelligenceOIDCHandlerConfig` |

### `IntelligenceSourceIdentity`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `InstallationID` | `string` |
| `TenantID` | `string` |
| `ConnectionID` | `string` |
| `FamilyID` | `string` |
| `PrincipalUserID` | `string` |
| `ChatID` | `string` |
| `ScopeKind` | `string` |
| `InstallationEnabled` | `bool` |
| `ConnectionEnabled` | `bool` |

### `IntelligenceSourceEvent`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `EventID` | `string` |
| `TenantID` | `string` |
| `ConnectionID` | `string` |
| `ResourceID` | `string` |
| `RevisionID` | `string` |
| `OrderToken` | `string` |
| `SourceSequence` | `*int64` |
| `ContainerID` | `string` |
| `ObservedAt` | `time.Time` |
| `Kind` | `string` |
| `PolicyRefs` | `[]string` |
| `Tombstone` | `bool` |

### `IntelligenceSourceEventPage`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `Events` | `[]IntelligenceSourceEvent` |
| `NextCursor` | `string` |
| `HasMore` | `bool` |

### `IntelligenceResourceSnapshot`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `TenantID` | `string` |
| `ConnectionID` | `string` |
| `ResourceID` | `string` |
| `RevisionID` | `string` |
| `ContentRevisionID` | `string` |
| `MetadataRevisionID` | `string` |
| `ObservedAt` | `time.Time` |
| `Content` | `string` |
| `Metadata` | `map[string]any` |

### `IntelligenceAuthorizationDecision`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `TenantID` | `string` |
| `ResourceID` | `string` |
| `Operation` | `string` |
| `Allowed` | `bool` |
| `DecidedAt` | `time.Time` |
| `PolicyRevision` | `string` |

### `IntelligenceTextLocator`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `Kind` | `string` |
| `Start` | `int` |
| `End` | `int` |

### `IntelligenceCitationResolution`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `SourceReference` | `map[string]any` |
| `RevisionID` | `string` |
| `Excerpt` | `string` |

### `IntelligenceSourceAuditRecord`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `InstallationID` | `string` |
| `ConnectionID` | `string` |
| `Route` | `string` |
| `Result` | `string` |
| `RequestID` | `string` |

### `IntelligenceSourceOperations`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `Events` | `func(context.Context,` |
| `Snapshot` | `func(context.Context,` |
| `Authorize` | `func(context.Context,` |
| `ResolveCitation` | `func(context.Context,` |

### `IntelligenceSourceHandlerConfig`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `Enabled` | `bool` |
| `Authenticate` | `func(context.Context,` |
| `Operations` | `IntelligenceSourceOperations` |
| `Audit` | `func(context.Context,` |
| `Limit` | `func(context.Context,` |
| `Timeout` | `time.Duration` |
| `MaxBodyBytes` | `int64` |

### `IntelligenceSourceHandler`
_Source: `backend/internal/transport/http/intelligence_source_handler.go`_

| Field | Type |
| :--- | :--- |
| `config` | `IntelligenceSourceHandlerConfig` |

### `IntelligenceSourceV2ConsentPrincipal`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `FamilyID` | `string` |

### `IntelligenceSourceV2ConsentParameters`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `ResponseType` | `string` |
| `ClientID` | `string` |
| `RedirectURI` | `string` |
| `State` | `string` |
| `CodeChallenge` | `string` |
| `CodeChallengeMethod` | `string` |

### `IntelligenceSourceV2ConsentChat`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Title` | `string` |
| `Type` | `string` |

### `IntelligenceSourceV2ConsentOffer`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `ClientID` | `string` |
| `RedirectURI` | `string` |
| `State` | `string` |
| `Chats` | `[]IntelligenceSourceV2ConsentChat` |
| `SpaceScopeAvailable` | `bool` |
| `Grants` | `map[string]bool` |

### `IntelligenceSourceV2ConsentRequest`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `ScopeKind` | `string` |
| `ChatID` | `string` |
| `ConfirmSpaceAccess` | `bool` |
| `Grants` | `map[string]bool` |

### `IntelligenceSourceV2ConsentRedirect`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `RedirectURI` | `string` |
| `Code` | `string` |
| `State` | `string` |

### `IntelligenceBrowserSessionRequest`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `Flow` | `string` |
| `ResponseType` | `string` |
| `ClientID` | `string` |
| `RedirectURI` | `string` |
| `State` | `string` |
| `Nonce` | `string` |
| `CodeChallenge` | `string` |
| `CodeChallengeMethod` | `string` |
| `ScopeKind` | `string` |
| `ChatID` | `string` |
| `ConfirmSpaceAccess` | `bool` |
| `Grants` | `map[string]bool` |

### `IntelligenceBrowserSessionTicket`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `Value` | `string` |
| `ExpiresIn` | `int64` |

### `IntelligenceSourceV2ConnectionSummary`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ScopeKind` | `string` |
| `ChatID` | `string` |
| `ChatTitle` | `string` |
| `Grants` | `map[string]bool` |
| `CreatedAt` | `time.Time` |
| `ExpiresAt` | `time.Time` |
| `RevokedAt` | `*time.Time` |

### `IntelligenceSourceV2CredentialResponse`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `ConnectionID` | `string` |
| `ScopeKind` | `string` |
| `ScopeID` | `string` |
| `ChatID` | `string` |
| `SourceCredential` | `string` |
| `TokenType` | `string` |
| `ExpiresIn` | `int64` |
| `Grants` | `map[string]bool` |

### `IntelligenceSourceV2ConsentOperations`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `Offer` | `func(context.Context,` |
| `Authorize` | `func(context.Context,` |
| `CreateBrowserSession` | `func(context.Context,` |
| `AuthorizeBrowser` | `func(context.Context,` |
| `Exchange` | `func(context.Context,` |
| `Rotate` | `func(context.Context,` |
| `Revoke` | `func(context.Context,` |
| `ListConnections` | `func(context.Context,` |

### `IntelligenceSourceV2ConsentHandlerConfig`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `Authenticate` | `func(*stdhttp.Request)` |
| `Operations` | `IntelligenceSourceV2ConsentOperations` |
| `BrowserAppURL` | `string` |
| `Timeout` | `time.Duration` |

### `IntelligenceSourceV2ConsentHandler`
_Source: `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`_

| Field | Type |
| :--- | :--- |
| `config` | `IntelligenceSourceV2ConsentHandlerConfig` |

### `IntelligenceSourceV2DecisionScope`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `Kind` | `string` |
| `ResourceID` | `string` |

### `IntelligenceSourceV2AuthorizationDecision`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `TenantID` | `string` |
| `ConnectionID` | `string` |
| `PrincipalID` | `string` |
| `ResourceID` | `string` |
| `Operation` | `string` |
| `Allowed` | `bool` |
| `Scope` | `IntelligenceSourceV2DecisionScope` |
| `PolicyRevision` | `string` |
| `DecidedAt` | `time.Time` |
| `ValidUntil` | `time.Time` |

### `IntelligenceSourceV2CitationResolution`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `RevisionID` | `string` |
| `SourceReference` | `map[string]any` |
| `Excerpt` | `string` |

### `IntelligenceSourceV2Event`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `EventID` | `string` |
| `TenantID` | `string` |
| `ConnectionID` | `string` |
| `PrincipalID` | `string` |
| `ResourceID` | `string` |
| `RevisionID` | `string` |
| `OrderToken` | `string` |
| `SourceSequence` | `int64` |
| `ContainerID` | `string` |
| `ObservedAt` | `time.Time` |
| `Kind` | `string` |
| `PolicyRefs` | `[]string` |
| `Tombstone` | `bool` |
| `Origin` | `string` |
| `OperationID` | `string` |

### `IntelligenceSourceV2EventPage`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `Events` | `[]IntelligenceSourceV2Event` |
| `NextCursor` | `string` |
| `HasMore` | `bool` |

### `IntelligenceSourceV2EventFence`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `EventCursor` | `string` |
| `FenceSequence` | `int64` |

### `IntelligenceSourceV2ReplyResult`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `MessageID` | `string` |
| `OperationID` | `string` |
| `Origin` | `string` |

### `IntelligenceSourceV2ResourceSnapshot`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `TenantID` | `string` |
| `ConnectionID` | `string` |
| `PrincipalID` | `string` |
| `ResourceID` | `string` |
| `RevisionID` | `string` |
| `ContentRevisionID` | `string` |
| `MetadataRevisionID` | `string` |
| `ObservedAt` | `time.Time` |
| `Content` | `string` |
| `Metadata` | `map[string]any` |

### `IntelligenceSourceV2BackfillStart`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `BackfillID` | `string` |
| `SnapshotCursor` | `string` |
| `ScopeReset` | `bool` |

### `IntelligenceSourceV2SnapshotPage`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `SchemaVersion` | `string` |
| `Snapshots` | `[]IntelligenceSourceV2ResourceSnapshot` |
| `NextSnapshotCursor` | `string` |
| `HasMore` | `bool` |
| `FenceCursor` | `string` |

### `IntelligenceSourceV2AuditRecord`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `InstallationID` | `string` |
| `ConnectionID` | `string` |
| `Route` | `string` |
| `Result` | `string` |

### `IntelligenceSourceV2Operations`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `Authorize` | `func(context.Context,` |
| `StartBackfill` | `func(context.Context,` |
| `BackfillSnapshots` | `func(context.Context,` |
| `Events` | `func(context.Context,` |
| `EventFence` | `func(context.Context,` |
| `Snapshot` | `func(context.Context,` |
| `ResolveCitation` | `func(context.Context,` |
| `Reply` | `func(context.Context,` |

### `IntelligenceSourceV2HandlerConfig`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `Enabled` | `bool` |
| `Authenticate` | `func(context.Context,` |
| `Operations` | `IntelligenceSourceV2Operations` |
| `Audit` | `func(context.Context,` |
| `Limit` | `func(context.Context,` |
| `Timeout` | `time.Duration` |
| `MaxBodyBytes` | `int64` |
| `Now` | `func()` |

### `IntelligenceSourceV2Handler`
_Source: `backend/internal/transport/http/intelligence_source_v2_handler.go`_

| Field | Type |
| :--- | :--- |
| `config` | `IntelligenceSourceV2HandlerConfig` |

### `InviteCreateRequest`
_Source: `backend/internal/transport/http/invite_handlers.go`_

| Field | Type |
| :--- | :--- |
| `Role` | `string` |
| `ExpiresInHours` | `*int` |
| `MaxUses` | `*int` |

### `InviteCreateResponse`
_Source: `backend/internal/transport/http/invite_handlers.go`_

| Field | Type |
| :--- | :--- |
| `InviteURL` | `string` |
| `Invite` | `any` |

### `InviteAcceptRequest`
_Source: `backend/internal/transport/http/invite_handlers.go`_

| Field | Type |
| :--- | :--- |
| `Nickname` | `string` |
| `Username` | `string` |
| `Password` | `string` |
| `DisplayName` | `string` |

### `InviteCreateHandler`
_Source: `backend/internal/transport/http/invite_handlers.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func()` |
| `IsValidRole` | `func(string)` |
| `Create` | `func(context.Context,` |

### `InviteAcceptHandler`
_Source: `backend/internal/transport/http/invite_handlers.go`_

| Field | Type |
| :--- | :--- |
| `ClientIP` | `func(*stdhttp.Request)` |
| `Accept` | `func(ctx` |
| `WriteSuccess` | `func(stdhttp.ResponseWriter,` |

### `InviteDeleteHandler`
_Source: `backend/internal/transport/http/invite_handlers.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func()` |
| `Revoke` | `func(context.Context,` |

### `InvitePreviewHandler`
_Source: `backend/internal/transport/http/invite_preview_handler.go`_

| Field | Type |
| :--- | :--- |
| `Find` | `func(context.Context,` |

### `LoginHandler`
_Source: `backend/internal/transport/http/login_handler.go`_

| Field | Type |
| :--- | :--- |
| `Authenticate` | `func(context.Context,` |
| `ClientIP` | `func(*stdhttp.Request)` |
| `WriteSuccess` | `func(stdhttp.ResponseWriter,` |

### `LogoutOperations`
_Source: `backend/internal/transport/http/logout_handler.go`_

| Field | Type |
| :--- | :--- |
| `RefreshCookieName` | `string` |
| `Revoke` | `func(context.Context,` |
| `ClearCookie` | `func(stdhttp.ResponseWriter,` |

### `LogoutHandler`
_Source: `backend/internal/transport/http/logout_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `LogoutOperations` |

### `ManifestHandler`
_Source: `backend/internal/transport/http/manifest_handler.go`_

| Field | Type |
| :--- | :--- |
| `cfg` | `config.Config` |
| `registry` | `*plugins.PluginRegistry` |

### `MCPConnectorCreatePayload`
_Source: `backend/internal/transport/http/mcp_connector_admin_handler.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `Provider` | `string` |
| `Alias` | `string` |
| `AuthMode` | `string` |
| `AllowedChatIDs` | `[]string` |
| `Permissions` | `map[string]bool` |
| `MaxHistoryMessages` | `*int` |

### `MCPConnectorUpdatePayload`
_Source: `backend/internal/transport/http/mcp_connector_admin_handler.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `*string` |
| `Alias` | `*string` |
| `AuthMode` | `*string` |
| `AllowedChatIDs` | `*[]string` |
| `Permissions` | `map[string]bool` |
| `MaxHistoryMessages` | `*int` |
| `Enabled` | `*bool` |

### `MCPConnectorAdminOperations`
_Source: `backend/internal/transport/http/mcp_connector_admin_handler.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func(AdminActor)` |
| `Create` | `func(context.Context,` |
| `Update` | `func(context.Context,` |
| `RegenerateToken` | `func(context.Context,` |
| `Revoke` | `func(context.Context,` |
| `ListAudit` | `func(context.Context,` |

### `MCPConnectorAdminHandler`
_Source: `backend/internal/transport/http/mcp_connector_admin_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MCPConnectorAdminOperations` |

### `MCPConnectorReadOperations`
_Source: `backend/internal/transport/http/mcp_connector_read_handlers.go`_

| Field | Type |
| :--- | :--- |
| `IsAdmin` | `func()` |
| `List` | `func(context.Context)` |
| `Get` | `func(context.Context,` |

### `MCPConnectorReadHandler`
_Source: `backend/internal/transport/http/mcp_connector_read_handlers.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MCPConnectorReadOperations` |

### `MediaPlaybackToken`
_Source: `backend/internal/transport/http/media_handler.go`_

| Field | Type |
| :--- | :--- |
| `Token` | `string` |
| `ExpiresAt` | `time.Time` |

### `MediaStream`
_Source: `backend/internal/transport/http/media_handler.go`_

| Field | Type |
| :--- | :--- |
| `Reader` | `io.ReadSeekCloser` |
| `ContentType,` | `OriginalName` |
| `Attachment` | `bool` |
| `ModifiedAt` | `time.Time` |

### `MediaOperations`
_Source: `backend/internal/transport/http/media_handler.go`_

| Field | Type |
| :--- | :--- |
| `Mint` | `func(context.Context,` |
| `Open` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `MediaHandler`
_Source: `backend/internal/transport/http/media_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MediaOperations` |

### `MessageHandlerOperations`
_Source: `backend/internal/transport/http/message_handlers.go`_

| Field | Type |
| :--- | :--- |
| `Get` | `func(context.Context,` |
| `Attach` | `func(context.Context,` |
| `Forward` | `func(context.Context,` |
| `Archive` | `func(context.Context,` |
| `GetArchive` | `func(context.Context)` |
| `React` | `func(context.Context,` |
| `Edit` | `func(context.Context,` |
| `Delete` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `MessageHandler`
_Source: `backend/internal/transport/http/message_handlers.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MessageHandlerOperations` |

### `MessageHistoryOperations`
_Source: `backend/internal/transport/http/message_history_handler.go`_

| Field | Type |
| :--- | :--- |
| `List` | `func(context.Context,` |
| `StatusFor` | `func(error)` |

### `MessageHistoryHandler`
_Source: `backend/internal/transport/http/message_history_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MessageHistoryOperations` |

### `MessageReadOperations`
_Source: `backend/internal/transport/http/message_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `Mark` | `func(context.Context,` |
| `IsMissing` | `func(error)` |
| `Error` | `func(error)` |
| `Published` | `func(context.Context,` |

### `MessageReadHandler`
_Source: `backend/internal/transport/http/message_read_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MessageReadOperations` |

### `MessageSendRequest`
_Source: `backend/internal/transport/http/message_send_handler.go`_

| Field | Type |
| :--- | :--- |
| `Type` | `string` |
| `Content` | `*string` |
| `FileIDs` | `[]string` |
| `ReplyToMessageID` | `*string` |
| `ThreadRootMessageID` | `*string` |
| `EncryptionProtocol` | `*string` |
| `Ciphertext` | `*string` |
| `Nonce` | `*string` |
| `KeyVersion` | `*int` |
| `EncryptionMetadata` | `*string` |
| `MentionedUserIDs` | `[]string` |
| `AttachmentsPending` | `bool` |
| `CollectionID` | `*string` |

### `MessageSendOperations`
_Source: `backend/internal/transport/http/message_send_handler.go`_

| Field | Type |
| :--- | :--- |
| `Send` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `MessageSendHandler`
_Source: `backend/internal/transport/http/message_send_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `MessageSendOperations` |

### `PasswordChangeHandler`
_Source: `backend/internal/transport/http/password_handler.go`_

| Field | Type |
| :--- | :--- |
| `RefreshCookieName` | `string` |
| `Change` | `func(context.Context,` |

### `PasswordChangeRequest`
_Source: `backend/internal/transport/http/password_handler.go`_

| Field | Type |
| :--- | :--- |
| `CurrentPassword` | `string` |
| `NewPassword` | `string` |

### `PinOperations`
_Source: `backend/internal/transport/http/pin_handlers.go`_

| Field | Type |
| :--- | :--- |
| `Pin` | `func(context.Context,` |
| `Unpin` | `func(context.Context,` |
| `List` | `func(context.Context,` |
| `StatusFor` | `func(error)` |
| `DetailFor` | `func(error)` |

### `PinHandler`
_Source: `backend/internal/transport/http/pin_handlers.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `PinOperations` |

### `PlanActor`
_Source: `backend/internal/transport/http/plan_http_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Role` | `string` |

### `PlanHTTPHandler`
_Source: `backend/internal/transport/http/plan_http_handler.go`_

| Field | Type |
| :--- | :--- |
| `plans` | `*featureplans.Service` |
| `decodeJSON` | `func(*http.Request,` |
| `emit` | `func(context.Context,` |

### `CreatePlanPayload`
_Source: `backend/internal/transport/http/plan_http_handler.go`_

| Field | Type |
| :--- | :--- |
| `Title` | `string` |
| `Notes` | `*string` |
| `Location` | `*string` |
| `StartsAt` | `time.Time` |
| `EndsAt` | `time.Time` |
| `AllDay` | `bool` |
| `TimeZone` | `string` |
| `Recurrence` | `*string` |
| `AttendeeIDs` | `[]string` |
| `SourceChatID` | `*string` |

### `PlanRSVPPayload`
_Source: `backend/internal/transport/http/plan_http_handler.go`_

| Field | Type |
| :--- | :--- |
| `Status` | `string` |

### `Member`
_Source: `backend/internal/transport/http/presenter/chat.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `DisplayName` | `string` |
| `Username` | `string` |
| `Role` | `string` |
| `PublicKey` | `*string` |
| `ProfilePhoto` | `any` |
| `AvatarMode` | `*string` |
| `AvatarSymbolID` | `*string` |
| `AvatarColorID` | `*string` |
| `IsOnline` | `bool` |
| `LastSeenAt` | `*time.Time` |
| `LastSeenVisibility` | `string` |

### `ProfileUpdateRequest`
_Source: `backend/internal/transport/http/profile_update_handler.go`_

| Field | Type |
| :--- | :--- |
| `DisplayName` | `*string` |
| `ProfileVisibility` | `*string` |
| `DirectMessagePermission` | `*string` |
| `Email` | `*string` |
| `AvatarMode` | `*string` |

### `ProfileUpdateHandler`
_Source: `backend/internal/transport/http/profile_update_handler.go`_

| Field | Type |
| :--- | :--- |
| `Validate` | `func(context.Context,` |
| `Update` | `func(context.Context,` |

### `RefreshOperations`
_Source: `backend/internal/transport/http/refresh_handler.go`_

| Field | Type |
| :--- | :--- |
| `RefreshCookieName` | `string` |
| `Rotate` | `func(context.Context,` |
| `ClientIP` | `func(*stdhttp.Request)` |
| `ClearCookie` | `func(stdhttp.ResponseWriter,` |
| `WriteSuccess` | `func(stdhttp.ResponseWriter,` |

### `RefreshHandler`
_Source: `backend/internal/transport/http/refresh_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `RefreshOperations` |

### `RoleActor`
_Source: `backend/internal/transport/http/role_handlers.go`_

| Field | Type |
| :--- | :--- |
| `FamilyID` | `string` |
| `Owner` | `bool` |
| `Permissions` | `[]string` |

### `RolePublic`
_Source: `backend/internal/transport/http/role_handlers.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Name` | `string` |
| `Description` | `string` |
| `Permissions` | `[]string` |
| `IsDefault` | `bool` |
| `MemberCount` | `int` |

### `RoleOperations`
_Source: `backend/internal/transport/http/role_handlers.go`_

| Field | Type |
| :--- | :--- |
| `List` | `func(context.Context,` |
| `Get` | `func(context.Context,` |
| `Create` | `func(context.Context,` |
| `Update` | `func(context.Context,` |
| `DeleteReplacingMembers` | `func(context.Context,` |
| `NewID` | `func()` |
| `Now` | `func()` |
| `LogError` | `func(operation` |

### `RoleHandler`
_Source: `backend/internal/transport/http/role_handlers.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `RoleOperations` |

### `Config`
_Source: `backend/internal/transport/http/server.go`_

| Field | Type |
| :--- | :--- |
| `Address` | `string` |
| `ReadHeaderTimeout` | `time.Duration` |

### `SetupRequest`
_Source: `backend/internal/transport/http/setup_handler.go`_

| Field | Type |
| :--- | :--- |
| `FamilyName` | `string` |
| `Nickname` | `string` |
| `Username` | `string` |
| `Password` | `string` |
| `DisplayName` | `string` |
| `InviteToken` | `string` |

### `SetupHandler`
_Source: `backend/internal/transport/http/setup_handler.go`_

| Field | Type |
| :--- | :--- |
| `Process` | `func(context.Context,` |
| `ClientIP` | `func(*stdhttp.Request)` |
| `WriteSuccess` | `func(stdhttp.ResponseWriter,` |

### `SetupStatus`
_Source: `backend/internal/transport/http/setup_status_handler.go`_

| Field | Type |
| :--- | :--- |
| `ActiveUserCount` | `int` |
| `FamilyName` | `*string` |

### `SetupStatusOperations`
_Source: `backend/internal/transport/http/setup_status_handler.go`_

| Field | Type |
| :--- | :--- |
| `Load` | `func(context.Context)` |
| `NavTabs` | `func()` |
| `LogError` | `func(operation` |

### `SetupStatusResponse`
_Source: `backend/internal/transport/http/setup_status_handler.go`_

| Field | Type |
| :--- | :--- |
| `SetupRequired` | `bool` |
| `SetupComplete` | `bool` |
| `FamilyName` | `*string` |
| `NavTabs` | `any` |

### `SetupStatusHandler`
_Source: `backend/internal/transport/http/setup_status_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `SetupStatusOperations` |

### `SFUTokenActor`
_Source: `backend/internal/transport/http/sfu_handler.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `DisplayName` | `string` |

### `SFUTokenOperations`
_Source: `backend/internal/transport/http/sfu_handler.go`_

| Field | Type |
| :--- | :--- |
| `IsSFUConfigured` | `func()` |
| `CreateToken` | `func(ctx` |

### `SFUTokenHandler`
_Source: `backend/internal/transport/http/sfu_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `SFUTokenOperations` |

### `SyncEventResponse`
_Source: `backend/internal/transport/http/sync_handler.go`_

| Field | Type |
| :--- | :--- |
| `Sequence` | `int64` |
| `EventID` | `string` |
| `Type` | `string` |
| `Version` | `int` |
| `AggregateType` | `string` |
| `AggregateID` | `string` |
| `Payload` | `json.RawMessage` |
| `OccurredAt` | `time.Time` |

### `SyncResponse`
_Source: `backend/internal/transport/http/sync_handler.go`_

| Field | Type |
| :--- | :--- |
| `Events` | `[]SyncEventResponse` |
| `NextCursor` | `*string` |
| `HasMore` | `bool` |

### `SyncOperations`
_Source: `backend/internal/transport/http/sync_handler.go`_

| Field | Type |
| :--- | :--- |
| `Page` | `func(context.Context,` |
| `InvalidCursor` | `error` |
| `InvalidLimit` | `error` |
| `LogFailure` | `func(error)` |

### `SyncHandler`
_Source: `backend/internal/transport/http/sync_handler.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `SyncOperations` |

### `TranscriptionActor`
_Source: `backend/internal/transport/http/transcription_handlers.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `FamilyID` | `string` |
| `Role` | `string` |
| `DisplayName` | `string` |

### `TranscriptionCall`
_Source: `backend/internal/transport/http/transcription_handlers.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `ChatID` | `string` |
| `CallerID` | `string` |

### `TranscriptionOperations`
_Source: `backend/internal/transport/http/transcription_handlers.go`_

| Field | Type |
| :--- | :--- |
| `CallByRoom` | `func(string)` |
| `IsParticipant` | `func(TranscriptionCall,` |
| `CanAccessChat` | `func(string,` |
| `IsAdministrator` | `func(string)` |
| `Latest` | `func(context.Context,` |
| `Transcript` | `func(context.Context,` |
| `UpdateSegment` | `func(context.Context,` |
| `ArtifactDownload` | `func(context.Context,` |
| `Start` | `func(ctx` |
| `Stop` | `func(ctx` |
| `RequestUpload` | `func(ctx` |
| `UploadData` | `func(ctx` |
| `CompleteUpload` | `func(ctx` |

### `TranscriptionHandler`
_Source: `backend/internal/transport/http/transcription_handlers.go`_

| Field | Type |
| :--- | :--- |
| `operations` | `TranscriptionOperations` |

### `TranscriptionSessionResponse`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `CallID` | `string` |
| `InitiatedBy` | `string` |
| `Status` | `transcription.SessionStatus` |
| `Provider` | `string` |
| `ProviderModel` | `string` |
| `StartedAt` | `*time.Time` |
| `StoppedAt` | `*time.Time` |
| `CompletedAt` | `*time.Time` |
| `SubmittedAudioMs` | `int64` |
| `EstimatedCostUSD` | `*float64` |
| `DetectedLanguages` | `[]string` |
| `FailureCode` | `*string` |
| `FailureMessage` | `*string` |
| `CreatedAt` | `time.Time` |

### `TranscriptSegmentResponse`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `CallID` | `string` |
| `SessionID` | `string` |
| `ParticipantID` | `string` |
| `ParticipantName` | `string` |
| `StartMs` | `int64` |
| `EndMs` | `int64` |
| `ExactText` | `string` |
| `CleanedText` | `*string` |
| `DetectedLanguage` | `*string` |
| `Confidence` | `*float64` |

### `TranscriptSummaryResponse`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `Summary` | `string` |
| `Decisions` | `[]transcription.DecisionItem` |
| `ActionItems` | `[]transcription.ActionItem` |
| `OpenQuestions` | `[]transcription.OpenQuestion` |

### `TranscriptResponse`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `Session` | `TranscriptionSessionResponse` |
| `Segments` | `[]TranscriptSegmentResponse` |
| `Summary` | `*TranscriptSummaryResponse` |

### `UploadAudioChunkRequest`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `SessionID` | `string` |
| `ParticipantID` | `string` |
| `Sequence` | `int` |
| `Container` | `string` |
| `CallStartMs` | `int64` |
| `CallEndMs` | `int64` |
| `DurationMs` | `int64` |
| `ClientVADScore` | `float64` |

### `UploadAudioChunkResponse`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `ChunkID` | `string` |
| `UploadURL` | `string` |
| `ObjectKey` | `string` |
| `ExpiresAt` | `string` |

### `CompleteAudioUploadRequest`
_Source: `backend/internal/transport/http/transcription_presenter.go`_

| Field | Type |
| :--- | :--- |
| `Checksum` | `string` |
| `SizeBytes` | `int64` |

### `ConnectArtifacts`
_Source: `backend/internal/transport/mcp/connect_artifacts.go`_

| Field | Type |
| :--- | :--- |
| `URL` | `string` |
| `CLICommand` | `string` |
| `SetupPrompt` | `string` |

### `ChatSummary`
_Source: `backend/internal/transport/mcp/list_chats.go`_

| Field | Type |
| :--- | :--- |
| `ID` | `string` |
| `Type` | `string` |
| `Title` | `string` |

### `Config`
_Source: `backend/internal/transport/mcp/server.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `Version` | `string` |
| `Endpoint` | `string` |
| `Register` | `func(*mcpserver.MCPServer)` |
| `BridgeContext` | `func(context.Context)` |

### `ToolHandlers`
_Source: `backend/internal/transport/mcp/tools.go`_

| Field | Type |
| :--- | :--- |
| `ConnectionStatus` | `func(context.Context,` |
| `ListChats` | `ListChats` |
| `GetChatHistory` | `func(context.Context,` |
| `SearchMessages` | `func(context.Context,` |
| `SendMessage` | `func(context.Context,` |
| `EditMessage` | `func(context.Context,` |
| `DeleteMessage` | `func(context.Context,` |
| `AddReaction` | `func(context.Context,` |
| `RemoveReaction` | `func(context.Context,` |
| `ForwardMessage` | `func(context.Context,` |
| `PinMessage` | `func(context.Context,` |
| `UnpinMessage` | `func(context.Context,` |
| `ListChatFiles` | `func(context.Context,` |
| `GetDownloadLink` | `func(context.Context,` |

### `MessageBrokerDependencies`
_Source: `backend/internal/transport/realtime/broker.go`_

| Field | Type |
| :--- | :--- |
| `Members` | `func(chatID` |
| `Online` | `func(userID` |
| `Emit` | `EmitToUser` |
| `Seen` | `func(eventID` |

### `SocketLifecycleHandlers`
_Source: `backend/internal/transport/realtime/events.go`_

| Field | Type |
| :--- | :--- |
| `Authenticate` | `func(map[string]string)` |
| `Connect` | `func(*socketio.Socket)` |

### `CoreEventHandlers`
_Source: `backend/internal/transport/realtime/events.go`_

| Field | Type |
| :--- | :--- |
| `Disconnect` | `func(*socketio.EventPayload)` |
| `HealthPing` | `func(*socketio.EventPayload)` |
| `AppState` | `func(*socketio.EventPayload)` |
| `MessageSend` | `func(*socketio.EventPayload)` |
| `MessageRead` | `func(*socketio.EventPayload)` |
| `TypingStart` | `func(*socketio.EventPayload)` |
| `TypingStop` | `func(*socketio.EventPayload)` |

### `CallEventHandlers`
_Source: `backend/internal/transport/realtime/events.go`_

| Field | Type |
| :--- | :--- |
| `Start` | `func(*socketio.EventPayload)` |
| `Join` | `func(*socketio.EventPayload)` |
| `Invite` | `func(*socketio.EventPayload)` |
| `Accept` | `func(*socketio.EventPayload)` |
| `Decline` | `func(*socketio.EventPayload)` |
| `Cancel` | `func(*socketio.EventPayload)` |
| `Leave` | `func(*socketio.EventPayload)` |
| `End` | `func(*socketio.EventPayload)` |
| `Signal` | `func(*socketio.EventPayload)` |

### `CallActor`
_Source: `backend/internal/transport/realtime/events.go`_

| Field | Type |
| :--- | :--- |
| `UserID` | `string` |
| `SocketID` | `string` |

### `CallbackCallCoordinator`
_Source: `backend/internal/transport/realtime/events.go`_

| Field | Type |
| :--- | :--- |
| `Start,` | `Join,` |

### `CallStartRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `CallType` | `string` |
| `InviteUserIDs` | `[]string` |

### `CallActionRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `RoomID` | `string` |

### `CallInviteRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `RoomID` | `string` |
| `InviteUserIDs` | `[]string` |

### `CallSignalRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `RoomID` | `string` |
| `TargetUserID` | `*string` |
| `Data` | `map[string]any` |

### `MessageSendRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |
| `Content` | `*string` |
| `ReplyToMessageID` | `*string` |
| `ThreadRootMessageID` | `*string` |
| `FileIDs` | `[]string` |
| `ClientMessageID` | `*string` |
| `EncryptionProtocol` | `*string` |
| `Ciphertext` | `*string` |
| `Nonce` | `*string` |
| `KeyVersion` | `*int` |
| `EncryptionMetadata` | `*string` |
| `MentionedUserIDs` | `[]string` |

### `MessageReadRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `MessageID` | `string` |
| `ChatID` | `*string` |

### `TypingRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `ChatID` | `string` |

### `AppStateRequest`
_Source: `backend/internal/transport/realtime/payload.go`_

| Field | Type |
| :--- | :--- |
| `Foreground` | `bool` |
| `ActiveChatID` | `string` |

### `Snapshot`
_Source: `backend/internal/tunnel/tunnel.go`_

| Field | Type |
| :--- | :--- |
| `State` | `string` |
| `Provider` | `*string` |
| `URL` | `*string` |
| `Origin` | `*string` |
| `Message` | `*string` |
| `Logs` | `[]string` |
| `AutoRestart` | `bool` |
| `Restarts` | `int` |
| `LastRestartReason` | `*string` |
| `HealthStatus` | `string` |
| `LastHealthCheckAt` | `*time.Time` |
| `LastHealthError` | `*string` |
| `HealthFailureStreak` | `int` |
| `HealthFailureThreshold` | `int` |

### `Manager`
_Source: `backend/internal/tunnel/tunnel.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.Mutex` |
| `cmd` | `*exec.Cmd` |
| `cancel` | `context.CancelFunc` |
| `provider` | `*string` |
| `url` | `*string` |
| `origin` | `*string` |
| `message` | `*string` |
| `logs` | `[]string` |
| `done` | `chan` |

### `Io`
_Source: `backend/third_party/socketio/client/client.go`_

| Field | Type |
| :--- | :--- |
| `pingInterval` | `time.Duration` |
| `pingTimeout` | `time.Duration` |
| `maxPayload` | `int` |

### `Handshake`
_Source: `backend/third_party/socketio/engineio/handshake.go`_

| Field | Type |
| :--- | :--- |
| `Headers` | `http.Header` |
| `Query` | `url.Values` |

### `HandshakeAuth`
_Source: `backend/third_party/socketio/engineio/handshake.go`_

| Field | Type |
| :--- | :--- |
| `Token` | `string` |

### `ConnParameters`
_Source: `backend/third_party/socketio/engineio/handshake.go`_

| Field | Type |
| :--- | :--- |
| `PingInterval` | `time.Duration` |
| `PingTimeout` | `time.Duration` |
| `SID` | `string` |
| `Upgrades` | `[]string` |
| `MaxPayload` | `int` |

### `EventPayload`
_Source: `backend/third_party/socketio/listener.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `SID` | `string` |
| `Socket` | `*Socket` |
| `Error` | `error` |
| `Data` | `[]interface{` |

### `Namespace`
_Source: `backend/third_party/socketio/namespace.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `sockets` | `*connections` |
| `rooms` | `*rooms` |
| `onConnection` | `connectionEvent` |

### `Polling`
_Source: `backend/third_party/socketio/protocol/polling.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.RWMutex` |
| `writer` | `closeWrapper` |
| `buf` | `[]string` |
| `Ready` | `chan` |

### `Room`
_Source: `backend/third_party/socketio/room.go`_

| Field | Type |
| :--- | :--- |
| `Name` | `string` |
| `To` | `func(room` |
| `sockets` | `connections` |
| `connectSockets` | `[]*Socket` |

### `UseError`
_Source: `backend/third_party/socketio/server.go`_

| Field | Type |
| :--- | :--- |
| `Message` | `string` |
| `Data` | `map[string]interface{` |

### `Io`
_Source: `backend/third_party/socketio/server.go`_

| Field | Type |
| :--- | :--- |
| `pingInterval` | `time.Duration` |
| `pingTimeout` | `time.Duration` |
| `maxPayload` | `int` |
| `namespaces` | `namespaces` |
| `sockets` | `connections` |
| `readChan` | `chan` |
| `onAuthentication` | `func(params` |
| `onConnection` | `connectionEvent` |
| `use` | `func(socket` |
| `close` | `chan` |

### `Conn`
_Source: `backend/third_party/socketio/socket.go`_

| Field | Type |
| :--- | :--- |
| `mu` | `sync.RWMutex` |
| `fasthttp` | `*websocket.Conn` |
| `http` | `*gWebsocket.Conn` |
| `polling` | `*protocol.Polling` |

### `Socket`
_Source: `backend/third_party/socketio/socket.go`_

| Field | Type |
| :--- | :--- |
| `Id` | `string` |
| `Nps` | `string` |
| `Conn` | `*Conn` |
| `Handshake` | `engineio.Handshake` |
| `rooms` | `roomNames` |
| `listeners` | `listeners` |
| `pingTime` | `time.Duration` |
| `dispose` | `[]func()` |
| `currentNamespace` | `func()` |
| `Join` | `func(room` |
| `Leave` | `func(room` |
| `To` | `func(room` |

### `Scenario`
_Source: `e2e/visual/scenarios.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string;viewport:{width:number;height:number` |

### `LogEntry`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `number` |
| `timestamp` | `string` |
| `level` | `LogLevel` |
| `levelNo` | `number` |
| `logger` | `string` |
| `message` | `string` |
| `module` | `string` |
| `functionName` | `string` |
| `lineNo` | `number` |
| `exception` | `string | null` |

### `LogsResponse`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `records` | `LogEntry[]` |
| `total` | `number` |
| `bufferSize` | `number` |
| `limit` | `number` |

### `LogQuery`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `level` | `LogLevel | ""` |
| `logger` | `string` |
| `search` | `string` |
| `limit` | `number` |

### `PublicAccessSettings`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `appUrl` | `string` |
| `apiUrl` | `string` |
| `configuredAppUrl` | `string | null` |
| `configuredApiUrl` | `string | null` |
| `environmentAppUrl` | `string` |
| `environmentApiUrl` | `string` |
| `inviteUrlIncludesApiUrl` | `boolean` |

### `MediaQualityRule`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `mediaType` | `"image" | "video" | "audio"` |
| `extension` | `string` |
| `qualityPercent` | `number` |

### `MediaQualitySettings`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `rules` | `MediaQualityRule[]` |

### `PublicAccessCandidate`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `label` | `string` |
| `appUrl` | `string` |
| `apiUrl` | `string` |

### `PublicAccessSuggestions`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `candidates` | `PublicAccessCandidate[]` |

### `PublicAccessCheckTarget`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `name` | `string` |
| `url` | `string` |
| `ok` | `boolean` |
| `statusCode` | `number | null` |
| `detail` | `string` |

### `PublicAccessCheckResponse`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `allOk` | `boolean` |
| `targets` | `PublicAccessCheckTarget[]` |

### `PublicTunnelStatus`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `state` | `"stopped" | "starting" | "running" | "error"` |
| `provider` | `"cloudflare" | "localtunnel" | null` |
| `url` | `string | null` |
| `origin` | `string | null` |
| `message` | `string | null` |
| `logs` | `string[]` |
| `autoRestart` | `boolean` |
| `restarts` | `number` |
| `lastRestartReason` | `string | null` |
| `healthStatus` | `"unknown" | "checking" | "healthy" | "degraded"` |
| `lastHealthCheckAt` | `string | null` |
| `lastHealthError` | `string | null` |
| `healthFailureStreak` | `number` |
| `healthFailureThreshold` | `number` |
| `publicAccess` | `PublicAccessSettings | null` |

### `PublicInviteLink`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `role` | `string` |
| `url` | `string` |
| `expiresAt` | `string` |
| `maxUses` | `number` |
| `usedCount` | `number` |

### `QuickStartPublicAccessResponse`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `status` | `"stopped" | "starting" | "running" | "error"` |
| `provider` | `"cloudflare" | "localtunnel"` |
| `publicUrl` | `string` |
| `origin` | `string | null` |
| `message` | `string | null` |
| `publicAccess` | `PublicAccessSettings` |
| `inviteLinks` | `PublicInviteLink[]` |

### `PublicIPQuickStartResponse`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `status` | `"ready" | "blocked"` |
| `publicIp` | `string` |
| `publicUrl` | `string` |
| `publicAccess` | `PublicAccessSettings | null` |
| `inviteLinks` | `PublicInviteLink[]` |
| `problems` | `string[]` |
| `recommendedActions` | `string[]` |
| `canUseCloudflareTunnel` | `boolean` |

### `DomainDnsRecord`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `type` | `string` |
| `name` | `string` |
| `value` | `string` |
| `proxied` | `boolean` |

### `DomainLinkResponse`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `publicIp` | `string` |
| `appUrl` | `string` |
| `apiUrl` | `string` |
| `records` | `DomainDnsRecord[]` |
| `publicAccess` | `PublicAccessSettings | null` |

### `EncryptionProtocolOption`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `value` | `AdminMessageEncryptionProtocol` |
| `label` | `string` |
| `description` | `string` |

### `EncryptionSettings`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `defaultMessageEncryptionProtocol` | `AdminMessageEncryptionProtocol` |
| `supportedProtocols` | `EncryptionProtocolOption[]` |
| `compatibilityNotes` | `string[]` |

### `NotificationProviderSettings`
_Source: `frontend/src/api/admin.ts`_

| Field | Type |
| :--- | :--- |
| `notificationProvider` | `NotificationProvider` |

### `CacheEntry`
_Source: `frontend/src/api/apiResponseCache.ts`_

| Field | Type |
| :--- | :--- |
| `savedAt` | `number; payload: unknown` |

### `AuthResponse`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string` |
| `tokenType` | `"Bearer"` |
| `expiresInSeconds` | `number` |
| `user` | `User` |
| `refreshToken` | `string; // returned in body for cross-origin (Capacitor) clients` |

### `PasskeyAuthenticationCeremony`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `ceremonyId` | `string` |
| `publicKey` | `Record<string, unknown>` |

### `BrowserQRLoginRequest`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `requestId` | `string` |
| `scanUrl` | `string` |
| `expiresAt` | `string` |

### `BrowserQRLoginStatus`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `status` | `"pending" | "approved" | "rejected" | "expired" | "completed"` |
| `auth` | `AuthResponse` |
| `accessToken` | `string` |
| `tokenType` | `"Bearer"` |
| `expiresInSeconds` | `number` |
| `user` | `User` |

### `SetupStatus`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `setupRequired` | `boolean` |
| `setupComplete` | `boolean` |
| `familyName` | `string | null` |
| `navTabs` | `{` |
| `chats` | `boolean` |
| `storage` | `boolean` |
| `plans` | `boolean` |
| `settings` | `boolean` |

### `SetupPayload`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `familyName` | `string` |
| `nickname` | `string` |
| `password` | `string` |
| `inviteToken` | `string` |

### `LoginPayload`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `username` | `string` |
| `password` | `string` |

### `ChangePasswordPayload`
_Source: `frontend/src/api/auth.ts`_

| Field | Type |
| :--- | :--- |
| `currentPassword` | `string` |
| `newPassword` | `string` |

### `Canvas`
_Source: `frontend/src/api/canvas.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `familyId` | `string` |
| `originChatId` | `string` |
| `createdBy` | `string` |
| `title` | `string` |
| `linkedChatIds` | `string[]` |
| `canManage` | `boolean` |
| `createdAt` | `string` |
| `updatedAt` | `string` |

### `CanvasReference`
_Source: `frontend/src/api/canvas.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `title` | `string` |
| `available` | `boolean` |

### `CanvasUpdate`
_Source: `frontend/src/api/canvas.ts`_

| Field | Type |
| :--- | :--- |
| `sequence` | `number` |
| `update` | `string` |
| `createdBy` | `string` |
| `createdAt` | `string` |

### `ChatExportSource`
_Source: `frontend/src/api/chatTransfer.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `chat` | `Chat` |
| `messages` | `Message[]` |

### `ImportedSourceAttachment`
_Source: `frontend/src/api/chatTransferTypes.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `path` | `string` |
| `filename` | `string` |
| `mimeType` | `string` |
| `size` | `number` |
| `checksum` | `string` |
| `externalUrl` | `string` |

### `MessageImportAttribution`
_Source: `frontend/src/api/chatTransferTypes.ts`_

| Field | Type |
| :--- | :--- |
| `sourceProvider` | `string` |
| `sourceMessageId` | `string` |
| `sourceAuthorId` | `string` |
| `sourceAuthorName` | `string` |
| `reactions` | `unknown` |
| `metadata` | `unknown` |
| `sourceAttachments` | `ImportedSourceAttachment[]` |
| `sourceDeletedAt` | `string | null` |

### `ChatMember`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `displayName` | `string` |
| `username` | `string` |
| `role` | `UserRole` |
| `publicKey` | `string | null` |
| `profilePhoto` | `FamilyFile | null` |
| `avatarMode` | `"photo" | "symbol"` |
| `avatarSymbolId` | `string | null` |
| `avatarColorId` | `string | null` |
| `email` | `string | null` |
| `bio` | `string | null` |
| `timezone` | `string | null` |
| `isOnline` | `boolean` |
| `lastSeenAt` | `string | null` |
| `lastSeenVisibility` | `"family" | "nobody"` |

### `MessageStatus`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `userId` | `string` |
| `status` | `"sent" | "delivered" | "read"` |
| `createdAt` | `string` |

### `MessageForward`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `messageId` | `string` |
| `chatId` | `string` |
| `senderId` | `string` |
| `senderDisplayName` | `string | null` |

### `MessageReaction`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `emoji` | `string` |
| `count` | `number` |
| `userIds` | `string[]` |
| `reacted` | `boolean` |

### `CallHistory`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `roomId` | `string` |
| `status` | `"missed" | "declined" | "canceled" | "failed" | "completed"` |
| `callType` | `"audio" | "video"` |
| `callerId` | `string` |
| `calleeId` | `string` |
| `durationSeconds` | `number | null` |

### `MessageCollectionCard`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `title` | `string` |
| `displayKind` | `"folder" | "album" | "music-album"` |
| `contentType` | `"mixed" | "media" | "audio" | "documents" | "custom"` |
| `itemCount` | `number` |
| `available` | `boolean` |

### `MessageHistoryPage`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `messages` | `Message[]` |
| `nextBefore` | `string` |
| `hasMore` | `boolean` |

### `MessageArchiveGroup`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `sourceChatId` | `string` |
| `messageCount` | `number` |

### `PinnedMessage`
_Source: `frontend/src/api/chats.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `messageId` | `string` |
| `pinnedBy` | `string` |
| `pinnedAt` | `string` |
| `message` | `Message` |

### `ChecklistItem`
_Source: `frontend/src/api/checklist.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `checklistId` | `string` |
| `text` | `string` |
| `completed` | `boolean` |
| `position` | `number` |
| `section` | `string` |
| `createdBy` | `string` |
| `completedBy` | `string` |
| `createdAt` | `string` |
| `updatedAt` | `string` |
| `completedAt` | `string` |

### `ChecklistCard`
_Source: `frontend/src/api/checklist.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `title` | `string` |
| `category` | `"grocery" | "errand" | "general" | string` |
| `available` | `boolean` |
| `items` | `ChecklistItem[]` |
| `totalItems` | `number` |
| `completedItems` | `number` |
| `canManage` | `boolean` |

### `Checklist`
_Source: `frontend/src/api/checklist.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `familyId` | `string` |
| `originChatId` | `string` |
| `createdBy` | `string` |
| `title` | `string` |
| `category` | `"grocery" | "errand" | "general" | string` |
| `linkedChatIds` | `string[]` |
| `canManage` | `boolean` |
| `items` | `ChecklistItem[]` |
| `totalItems` | `number` |
| `completedItems` | `number` |
| `createdAt` | `string` |
| `updatedAt` | `string` |

### `CreateChecklistItemPayload`
_Source: `frontend/src/api/checklist.ts`_

| Field | Type |
| :--- | :--- |
| `text` | `string` |
| `section` | `string` |

### `CreateChecklistPayload`
_Source: `frontend/src/api/checklist.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `title` | `string` |
| `category` | `"grocery" | "errand" | "general" | string` |
| `items` | `CreateChecklistItemPayload[]` |

### `BatchChecklistItemInput`
_Source: `frontend/src/api/checklist.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `text` | `string` |
| `completed` | `boolean` |
| `position` | `number` |
| `section` | `string` |

### `StorageCollection`
_Source: `frontend/src/api/collections.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `familyId` | `string` |
| `ownerId` | `string` |
| `title` | `string` |
| `displayKind` | `CollectionKind` |
| `contentType` | `CollectionContentType` |
| `customFileTypes` | `string` |
| `coverFileId` | `string | null` |
| `itemCount` | `number` |
| `accessLevel` | `CollectionAccessLevel` |
| `createdAt` | `string` |
| `updatedAt` | `string` |

### `CollectionGrant`
_Source: `frontend/src/api/collections.ts`_

| Field | Type |
| :--- | :--- |
| `principalType` | `"user" | "role"` |
| `principalId` | `string` |
| `accessLevel` | `CollectionAccessLevel` |

### `InvitePreview`
_Source: `frontend/src/api/family.ts`_

| Field | Type |
| :--- | :--- |
| `familyName` | `string` |
| `role` | `UserRole` |
| `expiresAt` | `string` |
| `usesRemaining` | `number` |

### `ServerRole`
_Source: `frontend/src/api/family.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `name` | `string` |
| `description` | `string` |
| `permissions` | `string[]` |
| `isDefault` | `boolean` |
| `memberCount` | `number` |

### `MemberAdminDetails`
_Source: `frontend/src/api/family.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `isActive` | `boolean` |
| `isOnline` | `boolean` |
| `joinedAt` | `string | null` |
| `lastSeenAt` | `string | null` |
| `candidateIp` | `string | null` |
| `candidateIpBanned` | `boolean` |
| `bannedIp` | `string | null` |

### `InviteResponse`
_Source: `frontend/src/api/family.ts`_

| Field | Type |
| :--- | :--- |
| `inviteUrl` | `string` |
| `invite` | `{` |
| `id` | `string` |
| `familyId` | `string` |
| `role` | `UserRole` |
| `expiresAt` | `string` |
| `maxUses` | `number` |
| `usedCount` | `number` |
| `createdBy` | `string` |
| `createdAt` | `string` |
| `revokedAt` | `string | null` |

### `AcceptInvitePayload`
_Source: `frontend/src/api/family.ts`_

| Field | Type |
| :--- | :--- |
| `nickname` | `string` |
| `password` | `string` |

### `InvitePasskeyOptions`
_Source: `frontend/src/api/family.ts`_

| Field | Type |
| :--- | :--- |
| `ceremonyId` | `string` |
| `publicKey` | `Record<string, unknown>` |

### `FamilyFile`
_Source: `frontend/src/api/files.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `familyId` | `string` |
| `uploadedBy` | `string` |
| `chatId` | `string | null` |
| `chatTitle` | `string | null` |
| `chatType` | `"family" | "direct" | "group" | "channel" | "voice" | "archive" | null` |
| `originMessageId` | `string | null` |
| `accessScope` | `"family" | "chat"` |
| `storageProvider` | `"local" | string` |
| `originalName` | `string` |
| `mimeType` | `string` |
| `sizeBytes` | `number` |
| `checksum` | `string | null` |
| `createdAt` | `string` |
| `deletedAt` | `string | null` |
| `isFavorite` | `boolean` |

### `MediaPlaybackToken`
_Source: `frontend/src/api/files.ts`_

| Field | Type |
| :--- | :--- |
| `token` | `string` |
| `expiresAt` | `string` |

### `DirectFileUploadReservationRequest`
_Source: `frontend/src/api/files.ts`_

| Field | Type |
| :--- | :--- |
| `originalName` | `string` |
| `mimeType` | `string` |
| `sizeBytes` | `number` |
| `checksum` | `string | null` |
| `chatId` | `string | null` |

### `DirectFileUploadReservation`
_Source: `frontend/src/api/files.ts`_

| Field | Type |
| :--- | :--- |
| `uploadId` | `string` |
| `fileId` | `string` |
| `state` | `"reserved" | "validating" | "ready" | "rejected" | string` |
| `uploadUrl` | `string` |
| `expiresAt` | `string` |
| `expectedMimeType` | `string` |
| `expectedSizeBytes` | `number` |

### `DirectFileAccess`
_Source: `frontend/src/api/files.ts`_

| Field | Type |
| :--- | :--- |
| `fileId` | `string` |
| `revision` | `string` |
| `url` | `string` |
| `expiresAt` | `string` |
| `mimeType` | `string` |
| `sizeBytes` | `number` |
| `checksum` | `string` |

### `FileTranscriptResponse`
_Source: `frontend/src/api/files.ts`_

| Field | Type |
| :--- | :--- |
| `fileId` | `string` |
| `text` | `string` |
| `language` | `string` |
| `duration` | `number` |

### `GuestMeetingPreview`
_Source: `frontend/src/api/guestMeetings.ts`_

| Field | Type |
| :--- | :--- |
| `title` | `string; scheduledAt?: string | null; admissionMode: "immediate" | "lobby"; expiresAt: string; guestCount: number; guestLimit: number; screenShareBitrateKbps?: number; cameraBitrateKbps?: number` |

### `GuestMeetingStatus`
_Source: `frontend/src/api/guestMeetings.ts`_

| Field | Type |
| :--- | :--- |
| `displayName` | `string; state: "waiting" | "admitted" | "blocked"` |

### `GuestMeetingSession`
_Source: `frontend/src/api/guestMeetings.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; state: "waiting" | "admitted"` |

### `GuestMeetingIntelligenceStatus`
_Source: `frontend/src/api/guestMeetings.ts`_

| Field | Type |
| :--- | :--- |
| `notesState` | `string; notesDuration?: number; recordingState: string; recordingDuration?: number` |

### `GuestMeetingCreated`
_Source: `frontend/src/api/guestMeetings.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; title: string; scheduledAt?: string | null; admissionMode: "immediate" | "lobby"; expiresAt: string; meetingUrl: string; guestLimit: number` |

### `HealthResult`
_Source: `frontend/src/api/health.ts`_

| Field | Type |
| :--- | :--- |
| `name` | `string` |
| `endpoint` | `string` |
| `status` | `ServiceStatus` |
| `detail` | `string` |

### `HealthPayload`
_Source: `frontend/src/api/health.ts`_

| Field | Type |
| :--- | :--- |
| `status` | `string` |
| `service` | `string` |
| `environment` | `string` |
| `version` | `string` |

### `IntelligenceConsentParameters`
_Source: `frontend/src/api/intelligence.ts`_

| Field | Type |
| :--- | :--- |
| `response_type` | `"code"` |
| `client_id` | `string` |
| `redirect_uri` | `string` |
| `state` | `string` |
| `code_challenge` | `string` |
| `code_challenge_method` | `"S256"` |
| `nonce` | `string` |

### `IntelligenceConsentOffer`
_Source: `frontend/src/api/intelligence.ts`_

| Field | Type |
| :--- | :--- |
| `client_id` | `string` |
| `redirect_uri` | `string` |
| `state` | `string` |
| `chats` | `Array<{ id: string; title: string; type: string` |

### `IntelligenceConnection`
_Source: `frontend/src/api/intelligence.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `scope_kind` | `"chat" | "space"` |
| `chat_id` | `string` |
| `chat_title` | `string` |
| `grants` | `IntelligenceGrants` |
| `created_at` | `string` |
| `expires_at` | `string` |
| `revoked_at` | `string | null` |

### `IntelligenceConnectionsResponse`
_Source: `frontend/src/api/intelligence.ts`_

| Field | Type |
| :--- | :--- |
| `connections` | `IntelligenceConnection[]` |

### `NavTabsConfig`
_Source: `frontend/src/api/masterAdmin.ts`_

| Field | Type |
| :--- | :--- |
| `chats` | `boolean` |
| `storage` | `boolean` |
| `plans` | `boolean` |
| `settings` | `boolean` |

### `ChatTypesConfig`
_Source: `frontend/src/api/masterAdmin.ts`_

| Field | Type |
| :--- | :--- |
| `direct` | `boolean` |
| `group` | `boolean` |
| `channel` | `boolean` |
| `voice` | `boolean` |

### `TenantAiSettings`
_Source: `frontend/src/api/masterAdmin.ts`_

| Field | Type |
| :--- | :--- |
| `translationEnabled` | `boolean` |
| `callRecordingEnabled` | `boolean` |
| `aiNotesEnabled` | `boolean` |
| `voiceTranscriptionEnabled` | `boolean` |

### `ServerRecord`
_Source: `frontend/src/api/masterAdmin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `number` |
| `slug` | `string` |
| `name` | `string` |
| `created_at` | `string` |
| `status` | `string` |
| `nav_tabs` | `NavTabsConfig` |
| `chat_types` | `ChatTypesConfig` |
| `public_preview` | `boolean` |

### `TenantCallQualitySettings`
_Source: `frontend/src/api/masterAdmin.ts`_

| Field | Type |
| :--- | :--- |
| `screenShareBitrateKbps` | `number` |

### `CreateServerResponse`
_Source: `frontend/src/api/masterAdmin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `number` |
| `slug` | `string` |
| `name` | `string` |
| `cluster_url` | `string` |
| `invite_url` | `string` |
| `nav_tabs` | `NavTabsConfig` |

### `MCPConnector`
_Source: `frontend/src/api/mcpConnectors.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `name` | `string` |
| `actorUserId` | `string` |
| `enabled` | `boolean` |
| `revoked` | `boolean` |
| `createdBy` | `string` |
| `createdAt` | `string` |
| `lastUsedAt` | `string | null` |
| `maxHistoryMessages` | `number` |
| `permissions` | `MCPPermissions` |
| `provider` | `MCPProviderId | string` |
| `alias` | `string` |
| `authMode` | `MCPAuthMode | string` |
| `allowedChatIds` | `string[]` |

### `MCPConnectorCreateResponse`
_Source: `frontend/src/api/mcpConnectors.ts`_

| Field | Type |
| :--- | :--- |
| `connector` | `MCPConnector` |
| `token` | `string` |
| `mcpUrl` | `string` |
| `claudeCommand` | `string` |
| `setupPrompt` | `string` |
| `cliCommand` | `string` |

### `MCPConnectorTokenResponse`
_Source: `frontend/src/api/mcpConnectors.ts`_

| Field | Type |
| :--- | :--- |
| `connector` | `MCPConnector` |
| `token` | `string` |
| `mcpUrl` | `string` |
| `claudeCommand` | `string` |
| `setupPrompt` | `string` |
| `cliCommand` | `string` |

### `MCPAuditEvent`
_Source: `frontend/src/api/mcpConnectors.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `connectorId` | `string` |
| `actorUserId` | `string` |
| `action` | `string` |
| `chatId` | `string | null` |
| `messageId` | `string | null` |
| `success` | `boolean` |
| `error` | `string | null` |
| `meta` | `unknown` |
| `createdAt` | `string` |

### `NtfyPlugin`
_Source: `frontend/src/api/notifications.ts`_

| Field | Type |
| :--- | :--- |
| `startService(options` | `{` |
| `topic` | `string` |
| `ntfyBaseUrl` | `string` |
| `quietHoursEnabled` | `boolean` |
| `quietHoursStart` | `string` |
| `quietHoursEnd` | `string` |

### `NotificationTopicResponse`
_Source: `frontend/src/api/notifications.ts`_

| Field | Type |
| :--- | :--- |
| `topic` | `string` |
| `ntfyBaseUrl` | `string` |

### `PasskeyOptionsEnvelope`
_Source: `frontend/src/api/passkeyOptions.ts`_

| Field | Type |
| :--- | :--- |
| `ceremonyId` | `string` |
| `publicKey` | `Record<string, unknown>` |

### `PlanAttendee`
_Source: `frontend/src/api/plans.ts`_

| Field | Type |
| :--- | :--- |
| `userId` | `string; status: PlanRSVP` |

### `Plan`
_Source: `frontend/src/api/plans.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; familyId: string; title: string; notes?: string | null; location?: string | null` |
| `startsAt` | `string; endsAt: string; allDay: boolean; timeZone: string; recurrence?: PlanRecurrence` |
| `createdBy` | `string; creatorDisplayName?: string; sourceChatId?: string | null; revision: number; createdAt: string; updatedAt: string` |
| `attendees` | `PlanAttendee[]` |

### `PlanDraft`
_Source: `frontend/src/api/plans.ts`_

| Field | Type |
| :--- | :--- |
| `title` | `string; notes?: string; location?: string; startsAt: string; endsAt: string; allDay: boolean` |
| `timeZone` | `string; recurrence?: PlanRecurrence; attendeeIds: string[]; sourceChatId?: string` |

### `PollOption`
_Source: `frontend/src/api/polls.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `text` | `string` |
| `optionIndex` | `number` |
| `voteCount` | `number` |
| `voted` | `boolean` |
| `voterIds` | `string[]` |

### `Poll`
_Source: `frontend/src/api/polls.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `chatId` | `string` |
| `messageId` | `string` |
| `question` | `string` |
| `isAnonymous` | `boolean` |
| `allowMultiple` | `boolean` |
| `isQuiz` | `boolean` |
| `correctOptionId` | `string | null` |
| `explanation` | `string | null` |
| `isClosed` | `boolean` |
| `totalVoters` | `number` |
| `createdAt` | `string` |
| `closedAt` | `string | null` |
| `options` | `PollOption[]` |

### `CreatePollPayload`
_Source: `frontend/src/api/polls.ts`_

| Field | Type |
| :--- | :--- |
| `question` | `string` |
| `options` | `{ text: string` |

### `PollVoterSummary`
_Source: `frontend/src/api/polls.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `displayName` | `string` |
| `username` | `string` |
| `profilePhoto` | `FamilyFile | null` |
| `avatarMode` | `"photo" | "symbol"` |
| `avatarSymbolId` | `string | null` |
| `avatarColorId` | `string | null` |

### `ServerAccount`
_Source: `frontend/src/api/serverRegistry.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string;                 // Backend UUID or URL-based hash` |
| `url` | `string;                // Base API URL (e.g., "https://stovo.mydomain.com/s/family")` |
| `name` | `string;               // Display / Family Name` |
| `addedAt` | `string` |
| `lastActiveAt` | `string` |
| `accessToken` | `string | null` |
| `refreshToken` | `string | null` |
| `user` | `User | null` |
| `healthStatus` | `"online" | "offline" | "unreachable" | "checking"` |
| `unreadCount` | `number` |

### `MultiServerState`
_Source: `frontend/src/api/serverRegistry.ts`_

| Field | Type |
| :--- | :--- |
| `activeServerId` | `string | null` |
| `servers` | `Record<string, ServerAccount>` |

### `ServerOverviewStats`
_Source: `frontend/src/api/stats.ts`_

| Field | Type |
| :--- | :--- |
| `total_messages` | `number` |
| `total_media` | `number` |
| `total_chats` | `number` |
| `total_users` | `number` |
| `avg_response_time_seconds` | `number` |
| `fast_response_percent` | `number` |
| `total_conversations_started` | `number` |
| `avg_session_duration_minutes` | `number` |
| `messages_by_hour` | `number[]` |
| `messages_by_day_of_week` | `number[]` |
| `response_time_buckets` | `{` |
| `under_1_min` | `number` |
| `from_1_to_5_min` | `number` |
| `from_5_to_30_min` | `number` |
| `over_30_min` | `number` |

### `ChatStats`
_Source: `frontend/src/api/stats.ts`_

| Field | Type |
| :--- | :--- |
| `chat_id` | `string` |
| `total_messages` | `number` |
| `total_media` | `number` |
| `total_members` | `number` |
| `avg_response_time_seconds` | `number` |
| `fastest_responder_name` | `string` |
| `fastest_responder_speed` | `number` |
| `messages_by_hour` | `number[]` |
| `top_members` | `Array<{` |
| `user_id` | `string` |
| `display_name` | `string` |
| `message_count` | `number` |
| `avg_response_time_seconds` | `number` |

### `AwardWinner`
_Source: `frontend/src/api/stats.ts`_

| Field | Type |
| :--- | :--- |
| `user_id` | `string` |
| `display_name` | `string` |
| `badge` | `string` |
| `description` | `string` |
| `value` | `string` |

### `FunAwards`
_Source: `frontend/src/api/stats.ts`_

| Field | Type |
| :--- | :--- |
| `night_owl` | `AwardWinner` |
| `early_bird` | `AwardWinner` |
| `lightning_responder` | `AwardWinner` |
| `icebreaker_monarch` | `AwardWinner` |
| `novel_writer` | `AwardWinner` |
| `one_word_wonder` | `AwardWinner` |
| `reaction_magnet` | `AwardWinner` |
| `dynamic_duo` | `{` |
| `user_1_name` | `string` |
| `user_2_name` | `string` |
| `description` | `string` |
| `thread_count` | `number` |

### `SyncEvent`
_Source: `frontend/src/api/sync.ts`_

| Field | Type |
| :--- | :--- |
| `sequence` | `number` |
| `eventId` | `string` |
| `type` | `string` |
| `version` | `number` |
| `aggregateType` | `string` |
| `aggregateId` | `string` |
| `occurredAt` | `string` |
| `payload` | `unknown` |

### `SyncPage`
_Source: `frontend/src/api/sync.ts`_

| Field | Type |
| :--- | :--- |
| `events` | `SyncEvent[]` |
| `nextCursor` | `string | null` |
| `hasMore` | `boolean` |

### `GetSyncPageOptions`
_Source: `frontend/src/api/sync.ts`_

| Field | Type |
| :--- | :--- |
| `cursor` | `string | null` |
| `limit` | `number` |

### `UnfurlData`
_Source: `frontend/src/api/unfurl.ts`_

| Field | Type |
| :--- | :--- |
| `url` | `string` |
| `title` | `string` |
| `description` | `string` |
| `image` | `string` |
| `siteName` | `string` |
| `favicon` | `string` |
| `mediaType` | `string` |

### `NotificationAppLink`
_Source: `frontend/src/appLinks.ts`_

| Field | Type |
| :--- | :--- |
| `path` | `string` |
| `action` | `"callback"` |

### `AppearanceSettings`
_Source: `frontend/src/appearance/AppearanceContext.tsx`_

| Field | Type |
| :--- | :--- |
| `themeMode` | `ThemeMode` |
| `accent` | `AccentChoice` |
| `customAccent` | `string` |
| `density` | `DensityChoice` |
| `wallpaper` | `WallpaperChoice` |
| `customWallpaperFileId` | `string | null` |
| `bubbleShape` | `BubbleShapeChoice` |
| `bubbleRadius` | `number` |
| `messageFont` | `MessageFontChoice` |
| `messageScale` | `number` |
| `avatarColor` | `string` |
| `videoAutoplay` | `boolean` |
| `autoDownloadMedia` | `boolean` |
| `autoDownloadLimitMB` | `number` |
| `autoDownloadWiFiOnly` | `boolean` |
| `renderMarkdown` | `boolean` |
| `sendOnEnter` | `boolean` |

### `AppearanceContextValue`
_Source: `frontend/src/appearance/AppearanceContext.tsx`_

| Field | Type |
| :--- | :--- |
| `appearance` | `AppearanceSettings` |
| `resolvedThemeMode` | `ResolvedThemeMode` |
| `setAppearance` | `Dispatch<SetStateAction<AppearanceSettings>>` |
| `updateAppearance` | `(patch: Partial<AppearanceSettings>) => void` |

### `NativeAudioPlaybackState`
_Source: `frontend/src/audioNativeBridge.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `NativeAudioPlaybackIdentity | null` |
| `position` | `number` |
| `duration` | `number` |
| `bufferedPosition` | `number` |
| `status` | `AudioPlaybackStatus` |
| `playWhenReady` | `boolean` |
| `isPlaying` | `boolean` |
| `suppressionReason` | `AudioSuppressionReason` |
| `canSeek` | `boolean` |
| `error` | `NativeAudioPlaybackErrorCode | null` |
| `revision` | `number` |
| `platform` | `"android"` |

### `AudioIdentity`
_Source: `frontend/src/audioPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `messageId` | `string` |
| `fileId` | `string` |

### `AudioDescriptor`
_Source: `frontend/src/audioPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `AudioIdentity` |
| `title` | `string` |
| `mimeType` | `string` |

### `AudioPlaybackSource`
_Source: `frontend/src/audioPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `url` | `string` |
| `token` | `string` |
| `mimeType` | `string` |
| `objectUrl` | `boolean` |

### `AudioPlaybackSnapshot`
_Source: `frontend/src/audioPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `Readonly<AudioIdentity> | null` |
| `title` | `string` |
| `position` | `number` |
| `duration` | `number` |
| `bufferedPosition` | `number` |
| `status` | `AudioPlaybackStatus` |
| `playWhenReady` | `boolean` |
| `isPlaying` | `boolean` |
| `suppressionReason` | `AudioSuppressionReason` |
| `canSeek` | `boolean` |
| `error` | `AudioPlaybackErrorCode | null` |
| `revision` | `number` |
| `platform` | `AudioPlaybackPlatform` |

### `AudioPlaybackRestore`
_Source: `frontend/src/audioPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `AudioIdentity` |
| `title` | `string` |
| `position` | `number` |
| `duration` | `number` |

### `AudioPlaybackBackend`
_Source: `frontend/src/audioPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `connect()` | `Promise<void>` |
| `getSnapshot()` | `AudioPlaybackSnapshot` |
| `subscribe(listener` | `(snapshot: AudioPlaybackSnapshot) => void): () => void` |
| `descriptor` | `AudioDescriptor,` |
| `source` | `AudioPlaybackSource,` |
| `position` | `number,` |
| `)` | `Promise<void>` |
| `play()` | `Promise<void>` |
| `pause()` | `Promise<void>` |
| `seek(position` | `number): Promise<void>` |
| `clear()` | `Promise<void>` |
| `setCallActive(active` | `boolean): Promise<void>` |
| `releaseSource?(source` | `AudioPlaybackSource): void` |
| `updateIdentity?(from` | `AudioIdentity, to: AudioIdentity): void` |

### `AudioRestoreTarget`
_Source: `frontend/src/audioRestore.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `messageId` | `string` |
| `fileId` | `string` |

### `AudioRestoreChat`
_Source: `frontend/src/audioRestore.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |

### `AudioRestoreAttachment`
_Source: `frontend/src/audioRestore.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `mimeType` | `string` |
| `deletedAt` | `string | null` |

### `AudioRestoreMessage`
_Source: `frontend/src/audioRestore.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `chatId` | `string` |
| `attachments` | `AudioRestoreAttachment[] | null` |

### `AuthState`
_Source: `frontend/src/auth/authContextTypes.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `isLoading` | `boolean` |
| `activeServer` | `ServerAccount | null` |
| `savedServers` | `ServerAccount[]` |
| `isOffline` | `boolean` |
| `hotSwapServer` | `(serverId: string) => Promise<void>` |
| `removeServer` | `(serverId: string) => void` |
| `login` | `(payload: LoginPayload) => Promise<void>` |
| `setup` | `(payload: SetupPayload) => Promise<void>` |
| `acceptAuthResponse` | `(response: AuthResponse) => void` |
| `updateCurrentUser` | `(user: User) => void` |
| `logout` | `() => Promise<void>` |
| `authRequest` | `<T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>` |

### `CallHistoryLabelInput`
_Source: `frontend/src/callHistory.ts`_

| Field | Type |
| :--- | :--- |
| `status` | `"missed" | "declined" | "canceled" | "failed" | "completed"` |
| `durationSeconds` | `number | null` |

### `AndroidQrConfirmationProps`
_Source: `frontend/src/components/AndroidQrConfirmation.tsx`_

| Field | Type |
| :--- | :--- |
| `apiUrl` | `string` |
| `isSubmitting` | `boolean` |
| `onConfirm` | `() => void` |
| `onCancel` | `() => void` |

### `AudioNowPlayingProps`
_Source: `frontend/src/components/AudioNowPlaying.tsx`_

| Field | Type |
| :--- | :--- |
| `session` | `AudioPlaybackSession` |
| `onRestore` | `(identity: AudioIdentity) => void` |
| `onFocusAfterClose` | `() => void` |

### `AudioPlayerProps`
_Source: `frontend/src/components/AudioPlayer.tsx`_

| Field | Type |
| :--- | :--- |
| `descriptor` | `AudioDescriptor` |
| `sourceFactory` | `AudioSourceFactory` |
| `disabledReason` | `string` |
| `onBeforePlay` | `() => void | Promise<void>` |
| `session` | `AudioPlaybackSession` |
| `/** Resolves a playable URL (typically a cached blob` | `) for metadata duration probe. */` |
| `resolveDurationUrl` | `() => Promise<string | null>` |
| `hideTitle` | `boolean` |
| `accessToken` | `string | null` |
| `strings` | `AppStrings` |

### `AvatarChoicePickerProps`
_Source: `frontend/src/components/AvatarChoicePicker.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `entityId` | `string` |
| `entityKind` | `AvatarEntityKind` |
| `label` | `string` |
| `file` | `FamilyFile | null` |
| `mode` | `"photo" | "symbol"` |
| `symbolId` | `string | null` |
| `colorId` | `string | null` |
| `allowPhoto` | `boolean` |
| `onModeChange` | `(mode: "photo" | "symbol") => void` |
| `onSymbolChange` | `(symbolId: AvatarSymbolId) => void` |
| `onColorChange` | `(colorId: AvatarColorId) => void` |

### `AvatarEditorModalProps`
_Source: `frontend/src/components/AvatarEditorModal.tsx`_

| Field | Type |
| :--- | :--- |
| `file` | `File` |
| `title` | `string` |
| `applyLabel` | `string` |
| `onSave` | `(croppedFile: File) => void | Promise<void>` |
| `onClose` | `() => void` |

### `BackButtonProps`
_Source: `frontend/src/components/BackButton.tsx`_

| Field | Type |
| :--- | :--- |
| `ariaLabel` | `string` |
| `className` | `string` |
| `onClick` | `MouseEventHandler<HTMLButtonElement>` |
| `title` | `string` |
| `to` | `To` |
| `buttonRef` | `Ref<HTMLButtonElement>` |

### `ScreenPresenter`
_Source: `frontend/src/components/CallParticipantGrid.tsx`_

| Field | Type |
| :--- | :--- |
| `userId` | `string` |
| `displayName` | `string` |
| `screenStream` | `MediaStream | null` |
| `isMuted` | `boolean` |
| `isMock` | `boolean` |

### `CallParticipantGridProps`
_Source: `frontend/src/components/CallParticipantGrid.tsx`_

| Field | Type |
| :--- | :--- |
| `localStream` | `MediaStream | null` |
| `localScreenStream` | `MediaStream | null` |
| `remoteMedia` | `RemoteMedia[]` |
| `localUserLabel` | `string` |
| `mirrorLocal` | `boolean` |
| `callType` | `"audio" | "video"` |
| `isGroupCall` | `boolean` |
| `isLocalSpeaking` | `boolean` |
| `isLocalMuted` | `boolean` |
| `isPeerSpeaking` | `boolean` |
| `speakingUserIds` | `string[]` |
| `onFlipLocalCamera` | `() => void` |
| `isFlippingCamera` | `boolean` |
| `localVideoPlaceholder` | `ReactNode` |
| `mockScreenShareOwner` | `{ userId: string; displayName: string` |

### `Props`
_Source: `frontend/src/components/ChatStatsDrawer.tsx`_

| Field | Type |
| :--- | :--- |
| `stats` | `ChatStats | null` |
| `chatTitle` | `string` |
| `isLoading` | `boolean` |
| `error` | `string | null` |
| `onClose` | `() => void` |

### `WallpaperAdjustments`
_Source: `frontend/src/components/ChatWallpaperEditorModal.tsx`_

| Field | Type |
| :--- | :--- |
| `zoom` | `number` |
| `brightness` | `number` |
| `contrast` | `number` |
| `gamma` | `number` |
| `hue` | `number` |
| `saturation` | `number` |
| `blur` | `number` |

### `ChatWallpaperEditorModalProps`
_Source: `frontend/src/components/ChatWallpaperEditorModal.tsx`_

| Field | Type |
| :--- | :--- |
| `file` | `File` |
| `onSave` | `(wallpaperFile: File) => void | Promise<void>` |
| `onClose` | `() => void` |

### `TablePreview`
_Source: `frontend/src/components/DocumentAttachmentPreview.tsx`_

| Field | Type |
| :--- | :--- |
| `sheets` | `Array<{ name: string; rows: string[][]` |

### `EntityAvatarProps`
_Source: `frontend/src/components/EntityAvatar.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `className` | `string` |
| `entityId` | `string` |
| `entityKind` | `AvatarEntityKind` |
| `file` | `FamilyFile | null` |
| `label` | `string | null` |
| `mode` | `"photo" | "symbol"` |
| `symbolId` | `string | null` |
| `colorId` | `string | null` |
| `size` | `number` |
| `style` | `CSSProperties` |

### `Props`
_Source: `frontend/src/components/ErrorBoundary.tsx`_

| Field | Type |
| :--- | :--- |
| `children` | `ReactNode` |
| `fallback` | `ReactNode` |

### `State`
_Source: `frontend/src/components/ErrorBoundary.tsx`_

| Field | Type |
| :--- | :--- |
| `hasError` | `boolean` |
| `error` | `Error | null` |

### `ExtensionSlotProps`
_Source: `frontend/src/components/ExtensionSlot.tsx`_

| Field | Type |
| :--- | :--- |
| `name` | `string` |
| `context` | `Record<string, any>` |
| `className` | `string` |

### `FormattingToolbarProps`
_Source: `frontend/src/components/FormattingToolbar.tsx`_

| Field | Type |
| :--- | :--- |
| `selection` | `TextSelection | null` |
| `anchor` | `ToolbarAnchor | null` |
| `onFormat` | `(kind: FormattingKind) => void` |
| `onCut` | `() => void` |
| `onCopy` | `() => void` |
| `onPaste` | `() => void` |

### `RectangleSize`
_Source: `frontend/src/components/FormattingToolbar.tsx`_

| Field | Type |
| :--- | :--- |
| `width` | `number` |
| `height` | `number` |

### `FormattingToolbarPlacementOptions`
_Source: `frontend/src/components/FormattingToolbar.tsx`_

| Field | Type |
| :--- | :--- |
| `formatOpen` | `boolean` |
| `gutter` | `number` |

### `Stroke`
_Source: `frontend/src/components/ImageEditorModal.tsx`_

| Field | Type |
| :--- | :--- |
| `color` | `string` |
| `width` | `number` |
| `points` | `{ x: number; y: number` |

### `CropRect`
_Source: `frontend/src/components/ImageEditorModal.tsx`_

| Field | Type |
| :--- | :--- |
| `x` | `number; // 0..100 percentage` |
| `y` | `number; // 0..100 percentage` |
| `width` | `number; // 0..100 percentage` |
| `height` | `number; // 0..100 percentage` |

### `ImageEditorModalProps`
_Source: `frontend/src/components/ImageEditorModal.tsx`_

| Field | Type |
| :--- | :--- |
| `pending` | `PendingLocalAttachment` |
| `onSave` | `(updatedFile: File) => void` |
| `onClose` | `() => void` |
| `isSelected` | `boolean` |
| `onToggleSelect` | `() => void` |

### `ImageLightboxProps`
_Source: `frontend/src/components/ImageLightbox.tsx`_

| Field | Type |
| :--- | :--- |
| `imageUrl` | `string` |
| `title` | `string` |
| `subtitle` | `string` |
| `isExternallyClosing` | `boolean` |
| `onClose` | `() => void` |
| `onDownload` | `() => void` |
| `onShare` | `() => void` |
| `onGoToMessage` | `() => void` |

### `InlineDocumentPreviewProps`
_Source: `frontend/src/components/InlineDocumentPreview.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string` |
| `file` | `FamilyFile` |
| `kind` | `DocumentPreviewKind` |
| `onResolvedSize` | `(sizeBytes: number) => void` |
| `loadTablePreview` | `(file: FamilyFile, blob: Blob) => Promise<TablePreview>` |
| `renderPdf` | `(blob: Blob) => ReactNode` |
| `renderDocx` | `(blob: Blob) => ReactNode` |

### `InviteModalProps`
_Source: `frontend/src/components/InviteModal.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string` |
| `familyName` | `string` |
| `inviteUrl` | `string | null` |
| `open` | `boolean` |
| `onClose` | `() => void` |

### `SecretReveal`
_Source: `frontend/src/components/MCPConnectorsPanel.tsx`_

| Field | Type |
| :--- | :--- |
| `token` | `string` |
| `mcpUrl` | `string` |
| `setupPrompt` | `string` |
| `cliCommand` | `string` |
| `connectorName` | `string` |
| `connectorId` | `string` |
| `provider` | `string` |
| `alias` | `string` |
| `allowInsightSearch` | `boolean` |
| `stovoConnectorCommand` | `string` |
| `insightMcpCommand` | `string` |

### `MessageMediaAlbumProps`
_Source: `frontend/src/components/MessageMediaAlbum.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `chatId` | `string` |
| `messageId` | `string` |
| `files` | `FamilyFile[]` |
| `disabledReason` | `string` |
| `videoAutoplay` | `boolean` |
| `renderImage` | `(file: FamilyFile) => ReactNode` |

### `PollVotersModalProps`
_Source: `frontend/src/components/PollVotersModal.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `open` | `boolean` |
| `onClose` | `() => void` |
| `poll` | `Poll` |
| `votersMap` | `Record<string, PollVoterSummary[]>` |
| `loading` | `boolean` |

### `QuickSwitcherItem`
_Source: `frontend/src/components/QuickSwitcherModal.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `type` | `"channel" | "dm" | "user" | "action"` |
| `title` | `string` |
| `subtitle` | `string` |
| `badge` | `string` |
| `icon` | `typeof Hash` |
| `chat` | `Chat` |
| `user` | `User` |
| `avatarFile` | `import("../api/files").FamilyFile | null` |
| `onSelect` | `() => void | Promise<void>` |

### `QuickSwitcherModalProps`
_Source: `frontend/src/components/QuickSwitcherModal.tsx`_

| Field | Type |
| :--- | :--- |
| `open` | `boolean` |
| `onClose` | `() => void` |

### `PreviewMessage`
_Source: `frontend/src/components/RealStovoDemo.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `sender` | `string` |
| `initials` | `string` |
| `tone` | `"blue" | "violet" | "green" | "amber"` |
| `text` | `string` |
| `time` | `string` |
| `attachment` | `Attachment` |

### `Chat`
_Source: `frontend/src/components/RealStovoDemo.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `section` | `string` |
| `name` | `string` |
| `preview` | `string` |
| `time` | `string` |
| `type` | `"group" | "direct" | "channel" | "voice"` |
| `members` | `number` |
| `subscribers` | `number` |
| `voiceInfo` | `string` |
| `disabled` | `boolean` |
| `avatarBg` | `string` |
| `avatarText` | `string` |
| `avatarImage` | `string` |
| `avatarIcon` | `"megaphone" | "hash" | "voice"` |
| `messages` | `PreviewMessage[]` |

### `WhiteboardElement`
_Source: `frontend/src/components/RichCanvasPreview.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `type` | `string` |
| `x` | `number` |
| `y` | `number` |
| `width` | `number` |
| `height` | `number` |
| `strokeColor` | `string` |
| `backgroundColor` | `string` |
| `strokeWidth` | `number` |
| `points` | `[number, number][]` |
| `text` | `string` |
| `fontSize` | `number` |
| `isDeleted` | `boolean` |

### `StorageCollectionPickerRequest`
_Source: `frontend/src/components/StorageCollections.tsx`_

| Field | Type |
| :--- | :--- |
| `collectionId` | `string` |
| `collectionTitle` | `string` |
| `lockedFileIds` | `string[]` |
| `allowedFileIds` | `string[]` |
| `onConfirm` | `(ids: string[]) => Promise<void>` |

### `StovoLogoProps`
_Source: `frontend/src/components/StovoLogo.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `title` | `string` |
| `size` | `number | string` |
| `style` | `React.CSSProperties` |

### `ToastMessage`
_Source: `frontend/src/components/ToastViewport.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `number; kind: ToastKind; message: string` |

### `VideoPlayerProps`
_Source: `frontend/src/components/VideoPlayer.tsx`_

| Field | Type |
| :--- | :--- |
| `file` | `FamilyFile` |
| `accessToken` | `string` |
| `identity` | `VideoIdentity` |
| `disabledReason` | `string` |
| `beforePlay` | `() => void | Promise<void>; fullViewRequest?: number` |
| `previewExpanded` | `boolean` |
| `autoplay` | `boolean` |

### `VoiceRecordButtonProps`
_Source: `frontend/src/components/VoiceRecordButton.tsx`_

| Field | Type |
| :--- | :--- |
| `isRecording` | `boolean` |
| `disabled` | `boolean` |
| `onPressStart` | `(event: PointerEvent<HTMLButtonElement>) => void` |
| `onPressEnd` | `(event: PointerEvent<HTMLButtonElement>) => void` |
| `onPressCancel` | `(event: PointerEvent<HTMLButtonElement>) => void` |

### `Props`
_Source: `frontend/src/components/YearWithStovoModal.tsx`_

| Field | Type |
| :--- | :--- |
| `data` | `YearWithStovo | null` |
| `isLoading` | `boolean` |
| `error` | `string | null` |
| `onClose` | `() => void` |

### `DocumentPickerListProps`
_Source: `frontend/src/components/attachment-picker/DocumentPickerList.tsx`_

| Field | Type |
| :--- | :--- |
| `items` | `NativeMediaItem[]` |
| `selectedItemIds` | `string[]` |
| `loading` | `boolean` |
| `emptyLabel` | `string` |
| `icon` | `ReactNode` |
| `onChoose` | `() => void` |
| `onToggle` | `(id: string) => void` |

### `MediaGalleryGridProps`
_Source: `frontend/src/components/attachment-picker/MediaGalleryGrid.tsx`_

| Field | Type |
| :--- | :--- |
| `media` | `NativeMediaItem[]` |
| `selectedItemIds` | `string[]` |
| `state` | `MediaPickerState` |
| `onToggle` | `(id: string) => void` |
| `onPreview` | `(item: NativeMediaItem) => void` |
| `onCamera` | `() => void` |
| `onChooseGallery` | `() => void` |
| `onRetry` | `() => void` |

### `RichChecklistCreatorProps`
_Source: `frontend/src/components/attachment-picker/RichChecklistCreator.tsx`_

| Field | Type |
| :--- | :--- |
| `onSubmit` | `(payload: {` |
| `title` | `string` |
| `category` | `"grocery" | "errand" | "general"` |
| `items` | `{ text: string; section?: string` |

### `ItemDraft`
_Source: `frontend/src/components/attachment-picker/RichChecklistCreator.tsx`_

| Field | Type |
| :--- | :--- |
| `text` | `string` |
| `section` | `string` |

### `RichPollCreatorProps`
_Source: `frontend/src/components/attachment-picker/RichPollCreator.tsx`_

| Field | Type |
| :--- | :--- |
| `onSubmit` | `(payload: CreatePollPayload) => Promise<void> | void` |
| `isSubmitting` | `boolean` |
| `onCancel` | `() => void` |

### `IconProps`
_Source: `frontend/src/components/icons/IconAttach.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconBack.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconBold.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconBrain.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconChats.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconClose.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconCompose.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconContacts.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconEmoji.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconItalic.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconLogout.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconMenu.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconPhone.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconSearch.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconSend.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconSettings.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconSpoiler.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconStorage.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconStrikethrough.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconUnderline.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `IconProps`
_Source: `frontend/src/components/icons/IconVideo.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `size` | `number` |
| `title` | `string` |

### `Hsv`
_Source: `frontend/src/components/ui/ColorPickerPopover.tsx`_

| Field | Type |
| :--- | :--- |
| `h` | `number; s: number; v: number` |

### `ColorPickerPopoverProps`
_Source: `frontend/src/components/ui/ColorPickerPopover.tsx`_

| Field | Type |
| :--- | :--- |
| `value` | `string` |
| `onChange` | `(hex: string) => void` |
| `label` | `string` |
| `className` | `string` |
| `style` | `CSSProperties` |
| `children` | `ReactNode` |

### `PopupDialogProps`
_Source: `frontend/src/components/ui/Popup.tsx`_

| Field | Type |
| :--- | :--- |
| `children` | `ReactNode` |
| `ariaLabel` | `string` |
| `ariaLabelledBy` | `string` |
| `ariaDescribedBy` | `string` |
| `onClose` | `() => void` |
| `closeOnBackdrop` | `boolean` |
| `closeOnEscape` | `boolean` |
| `dialogRole` | `"dialog" | "alertdialog"` |
| `closeLabel` | `string` |
| `showCloseButton` | `boolean` |
| `size` | `PopupSize` |
| `className` | `string` |
| `backdropClassName` | `string` |

### `PopupSelectOption`
_Source: `frontend/src/components/ui/PopupSelect.tsx`_

| Field | Type |
| :--- | :--- |
| `value` | `string` |
| `label` | `string` |
| `disabled` | `boolean` |

### `PopupSelectProps`
_Source: `frontend/src/components/ui/PopupSelect.tsx`_

| Field | Type |
| :--- | :--- |
| `options` | `PopupSelectOption[]` |
| `value` | `string` |
| `onChange` | `(value: string) => void` |
| `ariaLabel` | `string` |
| `triggerAriaLabel` | `string` |
| `labelledBy` | `string` |
| `disabled` | `boolean` |
| `className` | `string` |
| `triggerClassName` | `string` |
| `placeholder` | `string` |
| `emptyMessage` | `string` |
| `renderOption` | `(option: PopupSelectOption, selected: boolean) => ReactNode` |
| `menuFooter` | `ReactNode` |

### `NumberPreset`
_Source: `frontend/src/components/ui/PresetNumberControl.tsx`_

| Field | Type |
| :--- | :--- |
| `value` | `number` |
| `label` | `string` |

### `SidebarCollapseButtonProps`
_Source: `frontend/src/components/ui/SidebarCollapseButton.tsx`_

| Field | Type |
| :--- | :--- |
| `expanded` | `boolean` |
| `expandLabel` | `string` |
| `collapseLabel` | `string` |
| `onToggle` | `() => void` |
| `className` | `string` |
| `hidden` | `boolean` |

### `TextSelection`
_Source: `frontend/src/composerFormatting.ts`_

| Field | Type |
| :--- | :--- |
| `start` | `number` |
| `end` | `number` |

### `FormattingEdit`
_Source: `frontend/src/composerFormatting.ts`_

| Field | Type |
| :--- | :--- |
| `value` | `string` |
| `selectionStart` | `number` |
| `selectionEnd` | `number` |
| `changed` | `boolean` |
| `replaceStart` | `number` |
| `replaceEnd` | `number` |
| `replacement` | `string` |

### `ToolbarAnchor`
_Source: `frontend/src/composerFormatting.ts`_

| Field | Type |
| :--- | :--- |
| `left` | `number` |
| `top` | `number` |

### `ScreenConfig`
_Source: `frontend/src/config/profileManifest.ts`_

| Field | Type |
| :--- | :--- |
| `chats` | `boolean` |
| `media_gallery` | `boolean` |
| `voice_rooms` | `boolean` |
| `game_activity` | `boolean` |
| `audit_logs` | `boolean` |
| `member_invites` | `boolean` |
| `sso_management` | `boolean` |

### `FeatureConfig`
_Source: `frontend/src/config/profileManifest.ts`_

| Field | Type |
| :--- | :--- |
| `presence_detail_level` | `"basic" | "rich_game_status" | "working_hours"` |
| `end_to_end_encryption` | `boolean` |
| `custom_emojis` | `boolean` |
| `file_upload_limit_mb` | `number` |
| `default_theme` | `"family_warm" | "gamer_dark" | "corporate_slate" | string` |
| `allow_public_invites` | `boolean` |
| `require_sso_auth` | `boolean` |

### `ServerManifest`
_Source: `frontend/src/config/profileManifest.ts`_

| Field | Type |
| :--- | :--- |
| `profile` | `"family" | "gamer" | "corporate" | "custom"` |
| `display_name` | `string` |
| `screens` | `ScreenConfig` |
| `features` | `FeatureConfig` |
| `active_plugins` | `string[]` |

### `ConnectionCredentials`
_Source: `frontend/src/connectionLink.ts`_

| Field | Type |
| :--- | :--- |
| `serverUrl` | `string` |
| `username` | `string` |

### `MockApiInstallation`
_Source: `frontend/src/dev/mockApi.ts`_

| Field | Type |
| :--- | :--- |
| `origin` | `string` |
| `previousFetch` | `typeof fetch` |
| `wrappedFetch` | `typeof fetch` |
| `cleanup` | `() => void` |

### `MockCallParticipant`
_Source: `frontend/src/dev/mockCallBroker.ts`_

| Field | Type |
| :--- | :--- |
| `userId` | `string` |
| `state` | `MockCallParticipantState` |

### `MockCallSnapshot`
_Source: `frontend/src/dev/mockCallBroker.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `chatId` | `string` |
| `callType` | `"audio" | "video"` |
| `callerId` | `string` |
| `participants` | `MockCallParticipant[]` |
| `screenShareUserId` | `string | null` |
| `status` | `"ringing" | "active" | "ended"` |
| `version` | `number` |
| `createdAt` | `string` |
| `updatedAt` | `string` |

### `CreateMockCallInput`
_Source: `frontend/src/dev/mockCallBroker.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `chatId` | `string` |
| `callType` | `"audio" | "video"` |
| `callerId` | `string` |
| `inviteeIds` | `string[]` |
| `now` | `Date` |

### `MockFileUploadRequest`
_Source: `frontend/src/dev/mockFileStore.ts`_

| Field | Type |
| :--- | :--- |
| `originalName` | `string` |
| `mimeType` | `string` |
| `sizeBytes` | `number` |
| `checksum` | `string | null` |
| `idempotencyKey` | `string | null` |
| `chatId` | `string | null` |
| `uploadedBy` | `string` |
| `familyId` | `string` |
| `chatTitle` | `string | null` |
| `chatType` | `FamilyFile["chatType"]` |

### `MockFileUpload`
_Source: `frontend/src/dev/mockFileStore.ts`_

| Field | Type |
| :--- | :--- |
| `key` | `string` |
| `kind` | `"upload"` |
| `uploadId` | `string` |
| `fileId` | `string` |
| `request` | `MockFileUploadRequest` |
| `state` | `"reserved" | "ready"` |
| `blob` | `Blob` |
| `createdAt` | `string` |
| `expiresAt` | `string` |

### `MockStoredFile`
_Source: `frontend/src/dev/mockFileStore.ts`_

| Field | Type |
| :--- | :--- |
| `key` | `string` |
| `kind` | `"file"` |
| `metadata` | `FamilyFile` |
| `blob` | `Blob` |

### `MockData`
_Source: `frontend/src/dev/mockFixtures.ts`_

| Field | Type |
| :--- | :--- |
| `family` | `Family` |
| `users` | `User[]` |
| `chats` | `Chat[]` |
| `messages` | `Record<string, Message[]>` |
| `pins` | `Record<string, PinnedMessage[]>` |

### `FullViewImageState`
_Source: `frontend/src/features/chats/ChatOverlays.tsx`_

| Field | Type |
| :--- | :--- |
| `file` | `FamilyFile; previewUrl: string; messageId?: string` |

### `CallDeviceStrings`
_Source: `frontend/src/features/chats/calling/CallDeviceSelect.tsx`_

| Field | Type |
| :--- | :--- |
| `selectDevice` | `string` |
| `deviceLabelFormat` | `string` |
| `systemDefault` | `string` |
| `deviceSelectionUnavailable` | `string` |
| `selectDeviceLabel` | `(label: string) => string` |

### `CallFeatureContextValue`
_Source: `frontend/src/features/chats/calling/CallFeatureContext.tsx`_

| Field | Type |
| :--- | :--- |
| `session` | `CallSessionApi` |
| `isMobileViewport` | `boolean` |
| `members` | `User[]` |
| `currentUser` | `User | null` |
| `chats` | `Chat[]` |
| `onOpenChat` | `(chat: Chat) => void` |

### `CallPopupAudioStageProps`
_Source: `frontend/src/features/chats/calling/CallPopupAudioStage.tsx`_

| Field | Type |
| :--- | :--- |
| `activeChat` | `Chat | null` |

### `GroupParticipant`
_Source: `frontend/src/features/chats/calling/CallPopupAudioStage.tsx`_

| Field | Type |
| :--- | :--- |
| `userId` | `string; state?: string` |

### `GroupCallActiveBannerProps`
_Source: `frontend/src/features/chats/calling/GroupCallActiveBanner.tsx`_

| Field | Type |
| :--- | :--- |
| `chatTitle` | `string | null` |
| `activeCall` | `Record<string, any>` |
| `members` | `User[]` |
| `onOpenPreJoin` | `() => void` |

### `GroupCallPreJoinModalProps`
_Source: `frontend/src/features/chats/calling/GroupCallPreJoinModal.tsx`_

| Field | Type |
| :--- | :--- |
| `chatTitle` | `string | null` |
| `callType` | `"audio" | "video"` |
| `onClose` | `() => void` |
| `onJoin` | `(settings: { micMuted: boolean; cameraEnabled: boolean` |

### `GuestMeetingSelectOption`
_Source: `frontend/src/features/chats/calling/GuestMeetingSelect.tsx`_

| Field | Type |
| :--- | :--- |
| `value` | `string; label: string` |

### `LiveCaptionsOverlayProps`
_Source: `frontend/src/features/chats/calling/LiveCaptionsOverlay.tsx`_

| Field | Type |
| :--- | :--- |
| `isCaptionsEnabled` | `boolean` |
| `recentCaptions` | `LiveCaptionItem[]` |
| `currentInterimCaption` | `string | null` |
| `speakerDisplayName` | `string` |
| `className` | `string` |

### `MeetingIntelligencePopoverProps`
_Source: `frontend/src/features/chats/calling/MeetingIntelligencePopover.tsx`_

| Field | Type |
| :--- | :--- |
| `isOpen` | `boolean` |
| `onClose` | `() => void` |
| `anchorElement` | `HTMLElement | null` |
| `notesState` | `TranscriptState` |
| `onToggleNotes` | `() => void` |
| `isNotesAllowed` | `boolean` |
| `notesDisabledReason` | `string` |
| `onOpenTranscriptPanel` | `() => void` |
| `recordingState` | `RecordingState` |
| `recordingTimer` | `string` |
| `onToggleRecording` | `() => void` |
| `isRecordingAllowed` | `boolean` |
| `recordingDisabledReason` | `string` |
| `isCaptionsEnabled` | `boolean` |
| `onToggleCaptions` | `() => void` |
| `isMobile` | `boolean` |
| `inlineMenu` | `boolean` |

### `MobileActiveTopBarProps`
_Source: `frontend/src/features/chats/calling/MobileActiveTopBar.tsx`_

| Field | Type |
| :--- | :--- |
| `areControlsVisible` | `boolean` |
| `isLandscapeView` | `boolean` |
| `isSharingScreen` | `boolean` |
| `isParticipantFocused` | `boolean` |
| `onShrink` | `() => void` |
| `onCloseLandscape` | `() => void` |
| `onRotateLandscape` | `() => void` |
| `onCloseParticipantFocus` | `() => void` |
| `onInvite` | `() => void` |

### `SpeakingWaveBadgeProps`
_Source: `frontend/src/features/chats/calling/SpeakingWaveBadge.tsx`_

| Field | Type |
| :--- | :--- |
| `className` | `string` |
| `active` | `boolean` |

### `TranscriptPanelProps`
_Source: `frontend/src/features/chats/calling/TranscriptPanel.tsx`_

| Field | Type |
| :--- | :--- |
| `data` | `TranscriptData | null` |
| `isLoading` | `boolean` |
| `onClose` | `() => void` |

### `VoiceChannelStageProps`
_Source: `frontend/src/features/chats/calling/VoiceChannelStage.tsx`_

| Field | Type |
| :--- | :--- |
| `chat` | `Chat` |
| `session` | `CallSessionApi` |
| `members` | `User[]` |
| `currentUser` | `User | null` |
| `accessToken` | `string | null` |
| `canAddPeople` | `boolean` |
| `onOpenAddPeople` | `() => void` |
| `isExpanded` | `boolean` |
| `onToggleExpanded` | `() => void` |

### `BrowserTabCapture`
_Source: `frontend/src/features/chats/calling/callSurfaceCapture.ts`_

| Field | Type |
| :--- | :--- |
| `stream` | `MediaStream; track: MediaStreamTrack` |

### `CallUIPreferences`
_Source: `frontend/src/features/chats/calling/callUIPreferences.ts`_

| Field | Type |
| :--- | :--- |
| `autoHideControls` | `boolean; cameraFit: "fit" | "cover"` |

### `DirectCallStartupRefs`
_Source: `frontend/src/features/chats/calling/directCallStartup.ts`_

| Field | Type |
| :--- | :--- |
| `activeCallChatIdRef` | `RefObject<string | null>` |
| `activeCallSessionIdRef` | `RefObject<string | null>` |
| `callTypeRef` | `RefObject<"audio" | "video">` |
| `callPhaseRef` | `RefObject<CallPhase>` |
| `callStartupGenerationRef` | `RefObject<number>` |
| `callStartupPromiseRef` | `RefObject<Promise<void>>` |
| `callCleanupPromiseRef` | `RefObject<Promise<void>>` |

### `DirectCallStartupSetters`
_Source: `frontend/src/features/chats/calling/directCallStartup.ts`_

| Field | Type |
| :--- | :--- |
| `setActiveCallChatId` | `Dispatch<SetStateAction<string | null>>` |
| `setCallAudioSettings` | `Dispatch<SetStateAction<CallSettings>>` |
| `setCallAudioWarning` | `Dispatch<SetStateAction<string | null>>` |
| `setCallNotice` | `Dispatch<SetStateAction<string | null>>` |
| `setCallParticipantIds` | `Dispatch<SetStateAction<string[]>>` |
| `setCallPeerDisplayName` | `Dispatch<SetStateAction<string | null>>` |
| `setCallPeerUserId` | `Dispatch<SetStateAction<string | null>>` |
| `setCallPhase` | `Dispatch<SetStateAction<CallPhase>>` |
| `setCallTopology` | `Dispatch<SetStateAction<CallTopology>>` |
| `setCallType` | `Dispatch<SetStateAction<"audio" | "video">>` |

### `MockCallSessionStartup`
_Source: `frontend/src/features/chats/calling/directCallStartup.ts`_

| Field | Type |
| :--- | :--- |
| `isEnabled` | `boolean` |
| `startDirectCall` | `(type: "audio" | "video", inviteUserIds?: string[]) => Promise<boolean>` |

### `CreateDirectCallStarterParams`
_Source: `frontend/src/features/chats/calling/directCallStartup.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `selectedChat` | `Chat | null` |
| `socketRef` | `RefObject<Socket | null>` |
| `audioCallRef` | `RefObject<CallController | null>` |
| `refs` | `DirectCallStartupRefs` |
| `setters` | `DirectCallStartupSetters` |
| `mockCallSession` | `MockCallSessionStartup` |
| `setError` | `(message: string | null) => void` |
| `setSelectedChat` | `Dispatch<SetStateAction<Chat | null>>` |
| `resetCallState` | `(notice?: string, serverAlreadyNotified?: boolean, playEndSoundEffect?: boolean) => Promise<void>` |
| `applyCallAudioPatch` | `(patch: Partial<CallSettings>) => Promise<void>` |
| `loadCallQuality` | `(profile: CallQualityProfile) => Promise<void>` |

### `CallEndProjection`
_Source: `frontend/src/features/chats/calling/localCallEndProjection.ts`_

| Field | Type |
| :--- | :--- |
| `activeCall` | `Chat["activeCall"]; message: Message | null` |

### `RecordingMediaSources`
_Source: `frontend/src/features/chats/calling/meetingRecordingComposer.ts`_

| Field | Type |
| :--- | :--- |
| `localStream` | `MediaStream | null` |
| `localScreenStream` | `MediaStream | null` |
| `remoteStreams` | `{ cameraStream: MediaStream | null; screenStream?: MediaStream | null` |

### `MeetingVideo`
_Source: `frontend/src/features/chats/calling/meetingRecordingComposer.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; video: HTMLVideoElement` |

### `ScreenSharePresenterSize`
_Source: `frontend/src/features/chats/calling/screenShareLayout.ts`_

| Field | Type |
| :--- | :--- |
| `width` | `number; height: number` |

### `CallInviteControlsParams`
_Source: `frontend/src/features/chats/calling/useCallInviteControls.ts`_

| Field | Type |
| :--- | :--- |
| `audioCallRef` | `MutableRefObject<CallController | null>` |
| `callInviteSelection` | `string[]` |
| `setCallInviteSelection` | `Dispatch<SetStateAction<string[]>>` |
| `setIsCallInviteOpen` | `Dispatch<SetStateAction<boolean>>` |
| `onInvite` | `(userIds: string[]) => void` |

### `UseCallMediaParams`
_Source: `frontend/src/features/chats/calling/useCallMedia.ts`_

| Field | Type |
| :--- | :--- |
| `audioCallRef` | `MutableRefObject<CallController | null>` |
| `callPhase` | `"idle" | "incoming" | "outgoing" | "connecting" | "in-call"` |
| `callType` | `"audio" | "video"` |
| `callAudioSettings` | `CallSettings` |
| `setCallAudioSettings` | `Dispatch<SetStateAction<CallSettings>>` |
| `setCallAudioWarning` | `Dispatch<SetStateAction<string | null>>` |
| `setCallNotice` | `Dispatch<SetStateAction<string | null>>` |

### `RecordingSocketEvent`
_Source: `frontend/src/features/chats/calling/useCallRecording.test.tsx`_

| Field | Type |
| :--- | :--- |
| `roomId` | `string; recordingId: string; message: string` |

### `FakeSocket`
_Source: `frontend/src/features/chats/calling/useCallRecording.test.tsx`_

| Field | Type |
| :--- | :--- |
| `on` | `(event: string, handler: (payload: RecordingSocketEvent) => void) => void` |
| `off` | `(event: string, handler: (payload: RecordingSocketEvent) => void) => void` |
| `listeners` | `Map<string, (payload: RecordingSocketEvent) => void>` |

### `UseCallRecordingParams`
_Source: `frontend/src/features/chats/calling/useCallRecording.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `roomId` | `string | null` |
| `socketRef` | `React.RefObject<Socket | null>` |
| `localStream` | `MediaStream | null` |
| `localScreenStream` | `MediaStream | null` |
| `remoteStreams` | `{ cameraStream: MediaStream | null; screenStream?: MediaStream | null` |

### `UseCallRecordingReturn`
_Source: `frontend/src/features/chats/calling/useCallRecording.ts`_

| Field | Type |
| :--- | :--- |
| `recordingState` | `RecordingState` |
| `recordingId` | `string | null` |
| `recordingTimer` | `string` |
| `recordingDurationSeconds` | `number` |
| `recordingError` | `string | null` |
| `startRecording` | `() => Promise<void>` |
| `stopRecording` | `() => Promise<void>` |
| `isRecordingActive` | `boolean` |

### `MediaEffectsParams`
_Source: `frontend/src/features/chats/calling/useCallSessionMediaEffects.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `callPhase` | `CallPhase` |
| `hasRemoteVideo` | `boolean` |
| `remoteVideoStream` | `MediaStream | null` |
| `localVideoStream` | `MediaStream | null` |
| `localScreenStream` | `MediaStream | null` |
| `cameraEnabled` | `boolean` |
| `screenSharing` | `boolean` |
| `audioCallRef` | `MutableRefObject<CallController | null>` |
| `remoteVideoRef` | `MutableRefObject<HTMLVideoElement | null>` |
| `localVideoRef` | `MutableRefObject<HTMLVideoElement | null>` |

### `NativeEffectsParams`
_Source: `frontend/src/features/chats/calling/useCallSessionNativeEffects.ts`_

| Field | Type |
| :--- | :--- |
| `callPhase` | `CallPhase` |
| `callAudioSettings` | `CallSettings` |
| `callPhaseRef` | `MutableRefObject<CallPhase>` |
| `activeCallChatIdRef` | `MutableRefObject<string | null>` |
| `activeCallSessionIdRef` | `MutableRefObject<string | null>` |
| `pictureInPictureActiveRef` | `MutableRefObject<boolean>` |
| `videoPictureInPictureActiveRef` | `MutableRefObject<boolean>` |
| `lastNativeVideoRevisionRef` | `MutableRefObject<number>` |
| `setIsProximityNear` | `Dispatch<SetStateAction<boolean>>` |
| `setIsVideoPictureInPictureActive` | `Dispatch<SetStateAction<boolean>>` |
| `setIsCallMinimized` | `Dispatch<SetStateAction<boolean>>` |
| `syncNativePictureInPictureCallState` | `() => void` |
| `restoreActiveCallSurface` | `() => void` |
| `restoreActiveVideoSurface` | `(state: PictureInPictureState) => void` |

### `CallSessionSurfaceParams`
_Source: `frontend/src/features/chats/calling/useCallSessionSurface.ts`_

| Field | Type |
| :--- | :--- |
| `callPhaseRef` | `RefObject<CallPhase>` |
| `activeCallChatIdRef` | `RefObject<string | null>` |
| `activeCallSessionIdRef` | `RefObject<string | null>` |
| `activeChatIdRef` | `RefObject<string | undefined>` |
| `chatsRef` | `RefObject<Chat[]>` |
| `messageCacheRef` | `RefObject<Record<string, Message[]>>` |
| `navigate` | `NavigateFunction` |
| `prefersReducedMotion` | `boolean` |
| `setIsCallMinimized` | `Dispatch<SetStateAction<boolean>>` |
| `setIsDetailsOpen` | `Dispatch<SetStateAction<boolean>>` |
| `setMessages` | `Dispatch<SetStateAction<Message[]>>` |
| `setSelectedChat` | `Dispatch<SetStateAction<Chat | null>>` |
| `setIsVideoPictureInPictureActive` | `Dispatch<SetStateAction<boolean>>` |
| `videoPictureInPictureActiveRef` | `RefObject<boolean>` |

### `CallSignalingDependencies`
_Source: `frontend/src/features/chats/calling/useCallSignaling.ts`_

| Field | Type |
| :--- | :--- |
| `currentUser` | `User | null` |
| `remoteAudioRef` | `RefObject<HTMLAudioElement | null>` |
| `setCallType` | `Dispatch<SetStateAction<"audio" | "video">>; setCallNotice: Dispatch<SetStateAction<string | null>>` |
| `callPhaseRef` | `RefObject<CallPhase>; setCallPhase: Dispatch<SetStateAction<CallPhase>>; callTypeRef: RefObject<"audio" | "video">` |
| `applyCallAudioPatch` | `(patch: Partial<CallSettings>) => Promise<void>` |
| `setHasRemoteVideo` | `Dispatch<SetStateAction<boolean>>; setRemoteVideoStream: Dispatch<SetStateAction<MediaStream | null>>` |
| `setLocalVideoStream` | `Dispatch<SetStateAction<MediaStream | null>>; setLocalScreenStream: Dispatch<SetStateAction<MediaStream | null>>` |
| `setCallRemoteMedia` | `Dispatch<SetStateAction<RemoteMedia[]>>; setCallTopology: Dispatch<SetStateAction<CallTopology>>` |
| `setCallAudioSettings` | `Dispatch<SetStateAction<CallSettings>>; setIsPeerSpeaking: Dispatch<SetStateAction<boolean>>` |
| `setIsLocalSpeaking` | `Dispatch<SetStateAction<boolean>>; setSpeakingUserIds: Dispatch<SetStateAction<string[]>>` |
| `setCallAudioCapabilities` | `Dispatch<SetStateAction<CallCapabilities>>; audioCallRef: RefObject<CallController | null>` |
| `activeCallChatIdRef` | `RefObject<string | null>; activeCallSessionIdRef: RefObject<string | null>` |
| `setActiveCallChatId` | `Dispatch<SetStateAction<string | null>>; setCallRoomId: Dispatch<SetStateAction<string | null>>` |
| `callRoomIdRef` | `RefObject<string | null>; setCallParticipantIds: Dispatch<SetStateAction<string[]>>` |
| `setCallPeerUserId` | `Dispatch<SetStateAction<string | null>>; chatsRef: RefObject<Chat[]>; selectedChat: Chat | null` |
| `setActiveGroupCalls` | `Dispatch<SetStateAction<Record<string, Record<string, unknown>>>>` |
| `stopCallRingtone` | `() => void; startIncomingRingtone: () => void; setError: (message: string | null) => void` |
| `resetCallState` | `(notice?: string, serverAlreadyNotified?: boolean, playEndSoundEffect?: boolean) => Promise<void>` |

### `Position`
_Source: `frontend/src/features/chats/calling/useFloatingCallPanel.ts`_

| Field | Type |
| :--- | :--- |
| `x` | `number; y: number` |

### `SavedPosition`
_Source: `frontend/src/features/chats/calling/useFloatingCallPanel.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string; offsetX: number; offsetY: number` |

### `LiveCaptionItem`
_Source: `frontend/src/features/chats/calling/useLiveCaptions.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `speakerName` | `string` |
| `originalText` | `string` |
| `timestamp` | `number` |

### `UseLiveCaptionsParams`
_Source: `frontend/src/features/chats/calling/useLiveCaptions.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `roomId` | `string | null` |
| `guestToken` | `string | null` |
| `displayName` | `string` |
| `room` | `Room | null` |
| `localAudioStream` | `MediaStream | null` |

### `UseLiveCaptionsReturn`
_Source: `frontend/src/features/chats/calling/useLiveCaptions.ts`_

| Field | Type |
| :--- | :--- |
| `isCaptionsEnabled` | `boolean` |
| `toggleCaptions` | `() => void` |
| `currentInterimCaption` | `string | null` |
| `recentCaptions` | `LiveCaptionItem[]` |
| `isSpeechRecognitionSupported` | `boolean` |

### `MockCallSessionRefs`
_Source: `frontend/src/features/chats/calling/useMockCallSession.ts`_

| Field | Type |
| :--- | :--- |
| `activeCallSessionIdRef` | `RefObject<string | null>` |
| `activeCallChatIdRef` | `RefObject<string | null>` |
| `callRoomIdRef` | `RefObject<string | null>` |
| `callTypeRef` | `RefObject<"audio" | "video">` |
| `callPhaseRef` | `RefObject<CallPhase>` |

### `MockCallSessionSetters`
_Source: `frontend/src/features/chats/calling/useMockCallSession.ts`_

| Field | Type |
| :--- | :--- |
| `setActiveGroupCalls` | `Dispatch<SetStateAction<Record<string, Record<string, any>>>>` |
| `setCallPhase` | `Dispatch<SetStateAction<CallPhase>>` |
| `setActiveCallChatId` | `Dispatch<SetStateAction<string | null>>` |
| `setCallRoomId` | `Dispatch<SetStateAction<string | null>>` |
| `setCallPeerUserId` | `Dispatch<SetStateAction<string | null>>` |
| `setCallPeerDisplayName` | `Dispatch<SetStateAction<string | null>>` |
| `setCallType` | `Dispatch<SetStateAction<"audio" | "video">>` |
| `setCallTopology` | `Dispatch<SetStateAction<CallTopology>>` |
| `setCallParticipantIds` | `Dispatch<SetStateAction<string[]>>` |
| `setCallRemoteMedia` | `Dispatch<SetStateAction<RemoteMedia[]>>` |
| `setHasRemoteVideo` | `Dispatch<SetStateAction<boolean>>` |
| `setRemoteVideoStream` | `Dispatch<SetStateAction<MediaStream | null>>` |
| `setIsLocalSpeaking` | `Dispatch<SetStateAction<boolean>>` |
| `setIsPeerSpeaking` | `Dispatch<SetStateAction<boolean>>` |
| `setSpeakingUserIds` | `Dispatch<SetStateAction<string[]>>` |
| `setCallAudioSettings` | `Dispatch<SetStateAction<CallSettings>>` |
| `setCallNotice` | `Dispatch<SetStateAction<string | null>>` |

### `MockCallSessionParams`
_Source: `frontend/src/features/chats/calling/useMockCallSession.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `selectedChat` | `Chat | null` |
| `members` | `User[]` |
| `chatsRef` | `RefObject<Chat[]>` |
| `setSelectedChat` | `Dispatch<SetStateAction<Chat | null>>` |
| `setError` | `(message: string | null) => void` |
| `setPreJoinChatId` | `Dispatch<SetStateAction<string | null>>` |
| `resetCallState` | `(notice?: string, serverAlreadyNotified?: boolean, playEndSoundEffect?: boolean) => Promise<void>` |
| `refs` | `MockCallSessionRefs` |
| `setters` | `MockCallSessionSetters` |

### `TranscriptSegment`
_Source: `frontend/src/features/chats/calling/useTranscription.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `callId` | `string` |
| `sessionId` | `string` |
| `participantId` | `string` |
| `participantName` | `string` |
| `startMs` | `number` |
| `endMs` | `number` |
| `exactText` | `string` |
| `cleanedText` | `string | null` |
| `detectedLanguage` | `string | null` |
| `confidence` | `number | null` |

### `TranscriptSummary`
_Source: `frontend/src/features/chats/calling/useTranscription.ts`_

| Field | Type |
| :--- | :--- |
| `summary` | `string` |
| `decisions` | `{ text: string; sourceSegmentIds: string[]` |

### `TranscriptData`
_Source: `frontend/src/features/chats/calling/useTranscription.ts`_

| Field | Type |
| :--- | :--- |
| `session` | `{` |
| `id` | `string` |
| `callId` | `string` |
| `initiatedBy` | `string` |
| `status` | `string` |
| `provider` | `string` |
| `providerModel` | `string` |
| `startedAt` | `string | null` |
| `stoppedAt` | `string | null` |
| `completedAt` | `string | null` |
| `submittedAudioMs` | `number` |
| `estimatedCostUsd` | `number | null` |
| `detectedLanguages` | `string[]` |
| `failureCode` | `string | null` |
| `failureMessage` | `string | null` |
| `createdAt` | `string` |

### `AudioChunkUploadParams`
_Source: `frontend/src/features/chats/calling/useTranscription.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string` |
| `roomId` | `string` |
| `sessionId` | `string` |
| `participantId` | `string` |
| `sequence` | `number` |
| `container` | `"webm" | "ogg" | "mp4"` |
| `callStartMs` | `number` |
| `callEndMs` | `number` |
| `durationMs` | `number` |
| `clientVadScore` | `number` |
| `blob` | `Blob` |

### `UseTranscriptionParams`
_Source: `frontend/src/features/chats/calling/useTranscription.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `roomId` | `string | null` |
| `currentUserId` | `string | null` |
| `socketRef` | `React.RefObject<Socket | null>` |
| `localAudioStream` | `MediaStream | null` |
| `enabled` | `boolean` |

### `UseTranscriptionReturn`
_Source: `frontend/src/features/chats/calling/useTranscription.ts`_

| Field | Type |
| :--- | :--- |
| `transcriptState` | `TranscriptState` |
| `transcriptSessionId` | `string | null` |
| `transcriptData` | `TranscriptData | null` |
| `transcriptError` | `string | null` |
| `isTranscriptPanelOpen` | `boolean` |
| `toggleTranscriptPanel` | `() => void` |
| `startTranscription` | `() => Promise<void>` |
| `stopTranscription` | `() => Promise<void>` |
| `fetchTranscript` | `() => Promise<void>` |
| `resetTranscription` | `() => void` |

### `StoredDraft`
_Source: `frontend/src/features/chats/canvasDrafts.ts`_

| Field | Type |
| :--- | :--- |
| `canvas` | `Canvas; ownerId: string; update: string; serverCanvas: Canvas | null` |

### `CanvasDraft`
_Source: `frontend/src/features/chats/canvasDrafts.ts`_

| Field | Type |
| :--- | :--- |
| `canvas` | `Canvas; ownerId: string; document: Y.Doc; serverCanvas: Canvas | null` |
| `error` | `string | null; creating: boolean; released: boolean; apiBaseUrl: string; listeners: Set<() => void>; storageKey: string` |

### `ComposerEmojiPickerProps`
_Source: `frontend/src/features/chats/composer/ComposerEmojiPicker.tsx`_

| Field | Type |
| :--- | :--- |
| `open` | `boolean` |
| `showDocked` | `boolean` |
| `theme` | `"light" | "dark"` |
| `disabled` | `boolean` |
| `pickerRef` | `RefObject<HTMLDivElement | null>` |
| `dockRef` | `RefObject<HTMLDivElement | null>` |
| `onToggle` | `() => void` |
| `onEmojiPick` | `(emoji: EmojiClickData) => void` |

### `ComposerReplyBarProps`
_Source: `frontend/src/features/chats/composer/ComposerReplyBar.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `replyTarget` | `Message` |
| `onCancel` | `() => void` |

### `PendingAttachmentsStripProps`
_Source: `frontend/src/features/chats/composer/PendingAttachmentsStrip.tsx`_

| Field | Type |
| :--- | :--- |
| `attachments` | `PendingLocalAttachment[]` |
| `onRemove` | `(localId: string) => void` |
| `onEdit` | `(attachment: PendingLocalAttachment) => void` |

### `ReminderModalProps`
_Source: `frontend/src/features/chats/composer/ReminderModal.tsx`_

| Field | Type |
| :--- | :--- |
| `isOpen` | `boolean` |
| `messageText` | `string` |
| `attachments` | `PendingLocalAttachment[]` |
| `onClose` | `() => void` |
| `onConfirmReminder` | `(rule: ReminderRule) => void` |

### `ScheduleMessageModalProps`
_Source: `frontend/src/features/chats/composer/ScheduleMessageModal.tsx`_

| Field | Type |
| :--- | :--- |
| `isOpen` | `boolean` |
| `messageText` | `string` |
| `attachments` | `PendingLocalAttachment[]` |
| `onClose` | `() => void` |
| `onConfirmSchedule` | `(scheduledDate: Date) => void` |

### `SendSubmenuProps`
_Source: `frontend/src/features/chats/composer/SendSubmenu.tsx`_

| Field | Type |
| :--- | :--- |
| `isOpen` | `boolean` |
| `onClose` | `() => void` |
| `onSelectSchedule` | `() => void` |
| `onSelectReminder` | `() => void` |

### `Options`
_Source: `frontend/src/features/chats/composer/createQueuedComposerMessage.ts`_

| Field | Type |
| :--- | :--- |
| `chat` | `Chat` |
| `user` | `{ id: string; displayName: string` |

### `Options`
_Source: `frontend/src/features/chats/composer/sendQueuedNotificationReply.ts`_

| Field | Type |
| :--- | :--- |
| `text` | `string; accessToken: string | null; currentUser: { id: string` |

### `SlashCommandDefinition`
_Source: `frontend/src/features/chats/composer/slashCommandRegistry.ts`_

| Field | Type |
| :--- | :--- |
| `command` | `string` |
| `syntax` | `string` |
| `description` | `string` |
| `icon` | `ReactNode` |

### `ParsedRemindCommand`
_Source: `frontend/src/features/chats/composer/slashCommandRegistry.ts`_

| Field | Type |
| :--- | :--- |
| `timeExpr` | `string` |
| `text` | `string` |
| `scheduledDate` | `Date` |

### `ParsedSplitCommand`
_Source: `frontend/src/features/chats/composer/slashCommandRegistry.ts`_

| Field | Type |
| :--- | :--- |
| `amount` | `string` |
| `description` | `string` |
| `formattedMessage` | `string` |

### `UseAudioSessionLifecycleParams`
_Source: `frontend/src/features/chats/composer/useAudioSessionLifecycle.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `currentUserId` | `string | undefined` |

### `Options`
_Source: `frontend/src/features/chats/composer/useComposerDraftPersistence.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `selectedChatId` | `string | undefined` |
| `setComposer` | `Dispatch<SetStateAction<string>>` |
| `socketRef` | `RefObject<Socket | null>` |

### `Options`
_Source: `frontend/src/features/chats/composer/useComposerUiActions.ts`_

| Field | Type |
| :--- | :--- |
| `inputRef` | `RefObject<HTMLTextAreaElement | null>` |
| `setAttachmentSheetOpen` | `(open: boolean) => void` |
| `closeEmojiPicker` | `() => void` |
| `setAttachmentSheetInitialTab` | `(tab: "gallery") => void` |
| `setEditTargetMessage` | `(message: Message | null) => void` |
| `setMessageContextMenu` | `(menu: null) => void` |

### `UseMessageComposerParams`
_Source: `frontend/src/features/chats/composer/useMessageComposer.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `accessToken` | `string | null` |
| `currentUser` | `{ id: string; displayName: string` |

### `UseSharedFileQueueBridgeParams`
_Source: `frontend/src/features/chats/composer/useSharedFileQueueBridge.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `addSharedFileAttachments` | `(files: File[]) => void` |
| `onError` | `(message: string | null) => void` |

### `VoiceRecordingOptions`
_Source: `frontend/src/features/chats/composer/useVoiceMessageRecording.ts`_

| Field | Type |
| :--- | :--- |
| `disabled` | `boolean` |
| `cooldownSeconds` | `number` |
| `onError` | `(message: string | null) => void` |
| `onSend` | `(attachments: PendingLocalAttachment[]) => Promise<void>` |

### `CanvasCardBubbleProps`
_Source: `frontend/src/features/chats/conversation/CanvasCardBubble.tsx`_

| Field | Type |
| :--- | :--- |
| `canvas` | `CanvasReference` |
| `accessToken` | `string | null` |
| `onOpenCanvas` | `() => void` |

### `ChecklistCardBubbleProps`
_Source: `frontend/src/features/chats/conversation/ChecklistCardBubble.tsx`_

| Field | Type |
| :--- | :--- |
| `checklist` | `ChecklistCard` |
| `accessToken` | `string | null` |
| `currentUserId` | `string` |
| `onOpenChecklist` | `() => void` |

### `ConversationPanelProps`
_Source: `frontend/src/features/chats/conversation/ConversationPanel.tsx`_

| Field | Type |
| :--- | :--- |
| `thread` | `ConversationController` |
| `composer` | `ComposerController` |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `selectedChat` | `Chat | null` |
| `activeChatId` | `string` |
| `chats` | `Chat[]` |
| `members` | `User[]` |
| `memberLookup` | `Map<string, { displayName: string; username?: string` |

### `NotesTranscript`
_Source: `frontend/src/features/chats/conversation/MessageBubble.tsx`_

| Field | Type |
| :--- | :--- |
| `segments` | `Array<{ id: string; participantName?: string; participantId: string; startMs: number; exactText: string` |

### `GuestMeetingCardData`
_Source: `frontend/src/features/chats/conversation/MessageBubble.tsx`_

| Field | Type |
| :--- | :--- |
| `title` | `string` |
| `timing` | `string` |
| `entry` | `string` |
| `url` | `string` |

### `MessageContextMenuState`
_Source: `frontend/src/features/chats/conversation/MessageContextMenu.tsx`_

| Field | Type |
| :--- | :--- |
| `message` | `Message` |
| `x` | `number` |
| `y` | `number` |

### `ContextMenuSeenByEntry`
_Source: `frontend/src/features/chats/conversation/MessageContextMenu.tsx`_

| Field | Type |
| :--- | :--- |
| `userId` | `string` |
| `displayName` | `string` |
| `createdAt` | `string` |

### `PollBubbleProps`
_Source: `frontend/src/features/chats/conversation/PollBubble.tsx`_

| Field | Type |
| :--- | :--- |
| `poll` | `Poll` |
| `currentUserId` | `string` |
| `onVote` | `(pollId: string, optionIds: string[]) => Promise<void> | void` |
| `onClosePoll` | `(pollId: string) => Promise<void> | void` |
| `onViewVoters` | `(poll: Poll) => void` |
| `canClosePoll` | `boolean` |

### `Commenter`
_Source: `frontend/src/features/chats/conversation/ThreadSummaryButton.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string; name: string` |

### `UseAudioMessageRestoreParams`
_Source: `frontend/src/features/chats/conversation/useAudioMessageRestore.ts`_

| Field | Type |
| :--- | :--- |
| `currentUser` | `User | null` |
| `accessTokenRef` | `RefObject<string | null>` |
| `chatsRef` | `RefObject<Chat[]>` |
| `messageCacheRef` | `RefObject<Record<string, Message[]>>` |
| `activeChatIdRef` | `RefObject<string | undefined>` |
| `messagesRef` | `RefObject<Message[]>` |
| `setSelectedChat` | `Dispatch<SetStateAction<Chat | null>>` |
| `setMessages` | `Dispatch<SetStateAction<Message[]>>` |
| `setIsDetailsOpen` | `Dispatch<SetStateAction<boolean>>` |
| `pendingMessageFocusRef` | `RefObject<PendingMessageFocus | null>` |
| `onError` | `(message: string | null) => void` |
| `navigate` | `NavigateFunction` |
| `prefersReducedMotion` | `boolean` |
| `locationSearch` | `string` |

### `UseChatRealtimeParams`
_Source: `frontend/src/features/chats/conversation/useChatRealtime.ts`_

| Field | Type |
| :--- | :--- |
| `currentUserId` | `string | undefined` |
| `accessTokenRef` | `RefObject<string | null>` |
| `chatsRef` | `RefObject<Chat[]>` |
| `activeChatIdRef` | `RefObject<string | undefined>` |
| `applyMessagesForChat` | `(chatId: string, next: MessageStateUpdate) => void` |
| `onChatsUpdate` | `Dispatch<SetStateAction<Chat[]>>` |
| `onSelectedChatUpdate` | `Dispatch<SetStateAction<Chat | null>>` |
| `onTypingNamesUpdate` | `Dispatch<SetStateAction<string[]>>` |
| `onPinnedMessagesUpdate` | `Dispatch<SetStateAction<PinnedMessage[]>>` |
| `onPinIndexUpdate` | `Dispatch<SetStateAction<number>>` |
| `onMessageContextMenuUpdate` | `Dispatch<SetStateAction<MessageContextMenuState | null>>` |
| `onEditTargetMessageUpdate` | `Dispatch<SetStateAction<Message | null>>` |
| `draftBeforeEditRef` | `RefObject<string>` |
| `onError` | `(message: string | null) => void` |
| `reloadOverview` | `() => void` |

### `UseChatSocketConnectionParams`
_Source: `frontend/src/features/chats/conversation/useChatSocketConnection.ts`_

| Field | Type |
| :--- | :--- |
| `socketRef` | `RefObject<Socket | null>` |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `chatId` | `string | undefined` |
| `bindMessageListeners` | `(socket: Socket) => () => void` |
| `callSession` | `CallSessionApi` |
| `lastNativeVideoRevisionRef` | `RefObject<number>` |
| `reloadOverview` | `() => void` |

### `Params`
_Source: `frontend/src/features/chats/conversation/useMessageGestures.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `isMobileViewport` | `boolean` |
| `isMessageSelectionMode` | `boolean` |
| `channelCommentsDisabledForViewer` | `boolean` |
| `messageContextMenu` | `MessageContextMenuState | null` |
| `clearSelectedMessages` | `() => void` |
| `toggleSelectedMessage` | `(messageID: string) => void` |
| `setSelectedMessageIds` | `(messageIDs: string[]) => void` |
| `setMessageContextMenu` | `(menu: MessageContextMenuState | null) => void` |
| `onReplyToMessage` | `(message: Message) => void` |

### `UseMessageThreadParams`
_Source: `frontend/src/features/chats/conversation/useMessageThread.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `chatsRef` | `RefObject<Chat[]>` |
| `archiveGroup` | `string` |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `selectedChat` | `Chat | null` |
| `isMobileViewport` | `boolean` |
| `socketRef` | `RefObject<Socket | null>` |
| `authRequest` | `<T>(path: string, init?: { method?: string; body?: unknown` |

### `UseNativeVideoPipPublisherParams`
_Source: `frontend/src/features/chats/conversation/useNativeVideoPipPublisher.ts`_

| Field | Type |
| :--- | :--- |
| `currentUserId` | `string | undefined` |
| `callPhaseRef` | `RefObject<CallPhase>` |
| `videoPictureInPictureActiveRef` | `RefObject<boolean>` |
| `setIsVideoPictureInPictureActive` | `Dispatch<SetStateAction<boolean>>` |
| `lastNativeVideoRevisionRef` | `RefObject<number>` |

### `UseNotificationActionHandlerParams`
_Source: `frontend/src/features/chats/conversation/useNotificationActionHandler.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `selectedChat` | `Chat | null` |
| `locationPathname` | `string` |
| `locationSearch` | `string` |
| `navigate` | `NavigateFunction` |
| `sendQueuedNotificationReply` | `(text: string) => Promise<void>` |
| `startDirectCall` | `(type: "audio" | "video") => Promise<void>` |

### `UseVideoPictureInPictureBridgeParams`
_Source: `frontend/src/features/chats/conversation/useVideoPictureInPictureBridge.ts`_

| Field | Type |
| :--- | :--- |
| `accessTokenRef` | `RefObject<string | null>` |
| `chatsRef` | `RefObject<Chat[]>` |
| `messageCacheRef` | `RefObject<Record<string, Message[]>>` |
| `activeChatIdRef` | `RefObject<string | undefined>` |
| `messagesRef` | `RefObject<Message[]>` |
| `setSelectedChat` | `Dispatch<SetStateAction<Chat | null>>` |
| `setMessages` | `Dispatch<SetStateAction<Message[]>>` |
| `setIsDetailsOpen` | `Dispatch<SetStateAction<boolean>>` |
| `setThreadRootMessageId` | `Dispatch<SetStateAction<string | null>>` |
| `pendingMessageFocusRef` | `RefObject<PendingMessageFocus | null>` |
| `navigate` | `NavigateFunction` |
| `prefersReducedMotion` | `boolean` |

### `AddPeopleDialogProps`
_Source: `frontend/src/features/chats/details/AddPeopleDialog.tsx`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `members` | `User[]` |
| `onAdd` | `(userId: string) => Promise<void>` |
| `onClose` | `() => void` |

### `UseChatDetailsActionsParams`
_Source: `frontend/src/features/chats/details/useChatDetailsActions.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `selectedChat` | `Chat | null` |
| `currentUser` | `User | null` |
| `setSelectedChat` | `Dispatch<SetStateAction<Chat | null>>` |
| `setChats` | `Dispatch<SetStateAction<Chat[]>>` |
| `chatMutationVersionRef` | `MutableRefObject<Record<string, number>>` |
| `onError` | `(message: string | null) => void` |
| `setIsChatMenuOpen` | `Dispatch<SetStateAction<boolean>>` |
| `messages` | `Message[]` |
| `markChatRead` | `(chatId: string, messageId: string) => Promise<void>` |

### `OutboxProcessOptions`
_Source: `frontend/src/features/chats/outbox/messageOutboxProcessor.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string` |
| `currentUser` | `User` |
| `chats` | `Chat[]` |
| `applyMessagesForChat` | `(chatId: string, next: MessageStateUpdate) => void` |
| `onChatsUpdate` | `(updater: (current: Chat[]) => Chat[]) => void` |
| `onError` | `(error: string) => void` |

### `UseMessageOutboxOptions`
_Source: `frontend/src/features/chats/outbox/messageOutboxProcessor.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `chatsRef` | `{ current: Chat[]` |

### `QueuedOutboxAttachment`
_Source: `frontend/src/features/chats/outbox/messageOutboxStore.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `name` | `string` |
| `mimeType` | `string` |
| `size` | `number` |
| `blob` | `Blob` |
| `dataBase64` | `string` |
| `nativeSourceUri` | `string` |
| `uploadOperationId` | `string` |
| `uploadedFile` | `FamilyFile` |
| `uploadedFileId` | `string` |

### `ReminderRule`
_Source: `frontend/src/features/chats/outbox/messageOutboxStore.ts`_

| Field | Type |
| :--- | :--- |
| `frequency` | `"daily" | "weekly" | "monthly"` |
| `daysOfWeek` | `number[]; // 0 = Sun, 1 = Mon ... 6 = Sat` |
| `daysOfMonth` | `number[]; // 1 .. 31` |
| `repeatCount` | `number; // total repeat count (e.g. 5)` |
| `remainingCount` | `number; // remaining times (starts at repeatCount)` |
| `startDate` | `string; // "YYYY-MM-DD"` |
| `time` | `string; // "HH:mm"` |

### `QueuedOutboxMessage`
_Source: `frontend/src/features/chats/outbox/messageOutboxStore.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; // clientMessageId` |
| `clientMessageId` | `string` |
| `chatId` | `string` |
| `userId` | `string` |
| `content` | `string | null` |
| `replyToMessageId` | `string | null` |
| `threadRootMessageId` | `string | null` |
| `mentionedUserIds` | `string[]` |
| `encryptionProtocol` | `MessageEncryptionProtocol` |
| `attachments` | `QueuedOutboxAttachment[]` |
| `createdAt` | `string` |
| `status` | `"queued" | "sending" | "failed" | "scheduled"` |
| `deliveryError` | `string | null` |
| `attemptCount` | `number` |
| `lastAttemptAt` | `number` |
| `optimisticMessage` | `Message` |
| `scheduledFor` | `string | null` |
| `isReminder` | `boolean` |
| `reminderRule` | `ReminderRule | null` |

### `CallTrackStatus`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `echoCancellation` | `boolean | null` |
| `noiseSuppression` | `boolean | null` |
| `autoGainControl` | `boolean | null` |

### `SwipeReplyState`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `messageId` | `string` |
| `offset` | `number` |
| `activated` | `boolean` |

### `SwipeReplyGestureState`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `messageId` | `string` |
| `pointerId` | `number` |
| `startX` | `number` |
| `startY` | `number` |
| `lastOffset` | `number` |
| `lock` | `"pending" | "horizontal"` |

### `MessageLongPressState`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `messageId` | `string` |
| `pointerId` | `number` |
| `startX` | `number` |
| `startY` | `number` |
| `timerId` | `number` |

### `ChatExitSwipeState`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `pointerId` | `number` |
| `startX` | `number` |
| `startY` | `number` |
| `lock` | `"pending" | "horizontal" | "vertical"` |
| `committed` | `boolean` |

### `PendingMessageFocus`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `messageId` | `string` |
| `highlightClassName` | `"message-pin-flash" | "message-context-flash" | "message-audio-context-flash"` |
| `lockPinTracking` | `boolean` |

### `SendMessageErrorAck`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `ok` | `false` |
| `clientMessageId` | `string` |
| `message` | `string` |

### `PendingLocalAttachment`
_Source: `frontend/src/features/chats/shared/types.ts`_

| Field | Type |
| :--- | :--- |
| `localId` | `string` |
| `file` | `File` |
| `previewUrl` | `string | null` |

### `ChatContextMenuState`
_Source: `frontend/src/features/chats/sidebar/ChatContextMenu.tsx`_

| Field | Type |
| :--- | :--- |
| `chat` | `Chat` |
| `x` | `number` |
| `y` | `number` |

### `ChatFolderDialogProps`
_Source: `frontend/src/features/chats/sidebar/ChatFolderDialog.tsx`_

| Field | Type |
| :--- | :--- |
| `folder` | `ChatFolder | null` |
| `onClose` | `() => void` |
| `onSave` | `(folder: ChatFolder) => void` |
| `onDelete` | `(folder: ChatFolder) => void` |
| `title` | `string` |
| `allowDelete` | `boolean` |

### `QuickAccessSettings`
_Source: `frontend/src/features/chats/sidebar/ChatList.tsx`_

| Field | Type |
| :--- | :--- |
| `archiveEnabled` | `boolean` |
| `outboxEnabled` | `boolean` |
| `archiveView` | `"all" | "grouped"` |

### `ChatListProps`
_Source: `frontend/src/features/chats/sidebar/ChatList.tsx`_

| Field | Type |
| :--- | :--- |
| `isLoading` | `boolean` |
| `hasLoadedOverview` | `boolean` |
| `chatsBySection` | `Record<ChatSectionKey, Chat[]>` |
| `filteredChats` | `Chat[]` |
| `refreshChats` | `() => Promise<void>` |
| `familyId` | `string` |
| `canManageFolders` | `boolean` |
| `accessToken` | `string | null` |
| `currentUserId` | `string; activeVoiceCallChatId?: string | null; activeVoiceCallParticipantIds?: string[]` |
| `selectedChatId` | `string` |
| `activeChatId` | `string` |
| `minimizedChatLayout` | `boolean` |
| `onSelectChat` | `(chat: Chat) => void` |
| `onOpenChat` | `(chat: Chat) => void; onOpenMemberDm?: (userId: string) => void` |
| `onOpenDraftsAndScheduled` | `() => void` |
| `isDraftsAndScheduledActive` | `boolean` |
| `onOpenMessageArchive` | `() => void` |
| `isMessageArchiveActive` | `boolean` |
| `onStartNewChat` | `() => void` |

### `Props`
_Source: `frontend/src/features/chats/sidebar/ChatListContextMenu.tsx`_

| Field | Type |
| :--- | :--- |
| `menu` | `ChatContextMenuState | null` |
| `folders` | `ChatFolder[]` |
| `accessToken` | `string | null` |
| `currentUserId` | `string` |
| `onClose` | `() => void` |
| `onOpenChat` | `(chat: Chat) => void` |
| `onToggleMute` | `(chat: Chat) => void` |
| `onToggleFavorite` | `(chat: Chat) => void` |
| `onRemoveFromFolder` | `(folder: ChatFolder, chat: Chat) => void` |
| `onMoveToFolder` | `(folder: ChatFolder, chat: Chat) => void` |
| `onMarkAsRead` | `(chat: Chat) => void` |
| `onImported` | `() => void` |

### `ChatListItemProps`
_Source: `frontend/src/features/chats/sidebar/ChatListItem.tsx`_

| Field | Type |
| :--- | :--- |
| `chat` | `Chat` |
| `isActive` | `boolean` |
| `isTransitionSource` | `boolean` |
| `accessToken` | `string | null` |
| `currentUserId` | `string` |
| `activeVoiceCallChatId` | `string | null` |
| `activeVoiceCallParticipantIds` | `string[]` |
| `onOpenMemberDm` | `(userId: string) => void` |
| `minimizedChatLayout` | `boolean` |
| `isDragging` | `boolean` |
| `onSelect` | `(chat: Chat) => void` |
| `onOpen` | `(chat: Chat) => void` |
| `onDragStart` | `(event: React.DragEvent<HTMLElement>, chat: Chat) => void` |
| `onDragEnd` | `(event: React.DragEvent<HTMLElement>, chat: Chat) => void` |
| `onContextMenu` | `(event: React.MouseEvent<HTMLElement>, chat: Chat) => void` |

### `DefaultChatSectionDialogProps`
_Source: `frontend/src/features/chats/sidebar/DefaultChatSectionDialog.tsx`_

| Field | Type |
| :--- | :--- |
| `initialName` | `string` |
| `onClose` | `() => void` |
| `onSave` | `(name: string) => void` |

### `DeltaSyncOptions`
_Source: `frontend/src/features/chats/sidebar/chatDeltaSync.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string` |
| `userId` | `string` |
| `onMessageCreated` | `(message: Message) => Promise<void> | void` |
| `onFileChanged` | `(fileId: string, file: FamilyFile | null) => Promise<void> | void` |

### `ChatFolderRules`
_Source: `frontend/src/features/chats/sidebar/chatFolders.ts`_

| Field | Type |
| :--- | :--- |
| `chatTypes` | `FolderChatType[]` |
| `titleIncludes` | `string` |
| `unreadOnly` | `boolean` |
| `mutedOnly` | `boolean` |
| `favoritesOnly` | `boolean` |
| `includedChatIds` | `string[]` |
| `excludedChatIds` | `string[]` |

### `ChatFolder`
_Source: `frontend/src/features/chats/sidebar/chatFolders.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `name` | `string` |
| `rules` | `ChatFolderRules` |
| `symbolId` | `AvatarSymbolId` |
| `colorId` | `AvatarColorId` |

### `UseChatDataLoaderParams`
_Source: `frontend/src/features/chats/sidebar/useChatDataLoader.ts`_

| Field | Type |
| :--- | :--- |
| `accessTokenRef` | `RefObject<string | null>` |
| `authRequest` | `<T>(path: string, init?: { method?: string; body?: unknown` |

### `UseChatOverviewOptions`
_Source: `frontend/src/features/chats/sidebar/useChatOverview.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |
| `chats` | `Chat[]` |
| `members` | `User[]` |
| `currentUserId` | `string` |
| `onError` | `(message: string | null) => void` |
| `onNavigateToChat` | `(chat: Chat) => void` |
| `refreshChats` | `() => Promise<void>` |

### `UseChatWorkspaceStateParams`
_Source: `frontend/src/features/chats/sidebar/useChatWorkspaceState.ts`_

| Field | Type |
| :--- | :--- |
| `accessToken` | `string | null` |

### `UseEncryptionIdentitySyncParams`
_Source: `frontend/src/features/chats/sidebar/useEncryptionIdentitySync.ts`_

| Field | Type |
| :--- | :--- |
| `currentUser` | `User | null` |
| `authRequest` | `<T>(path: string, init?: { method?: string; body?: unknown` |

### `SlackUser`
_Source: `frontend/src/features/chats/transfer/adapters/slack.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; name: string` |

### `SlackChannel`
_Source: `frontend/src/features/chats/transfer/adapters/slack.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; name: string; members?: string[]` |

### `ExportProfile`
_Source: `frontend/src/features/chats/transfer/adapters/types.ts`_

| Field | Type |
| :--- | :--- |
| `providerId` | `ChatProviderId` |
| `profileId` | `string` |
| `formatVersion` | `string` |
| `compatibility` | `ExportCompatibility` |
| `knownLosses` | `readonly string[]` |
| `sideEffects` | `readonly string[]` |
| `mediaHandling` | `"embedded" | "references" | "mixed"` |

### `ExportPackage`
_Source: `frontend/src/features/chats/transfer/adapters/types.ts`_

| Field | Type |
| :--- | :--- |
| `filename` | `string` |
| `mimeType` | `string` |
| `bytes` | `Uint8Array` |
| `compatibility` | `ExportCompatibility` |
| `warnings` | `ChatArchive["warnings"]` |

### `AdapterParseContext`
_Source: `frontend/src/features/chats/transfer/adapters/types.ts`_

| Field | Type |
| :--- | :--- |
| `relatedFiles` | `File[]` |

### `ChatAdapter`
_Source: `frontend/src/features/chats/transfer/adapters/types.ts`_

| Field | Type |
| :--- | :--- |
| `readonly providerId` | `ChatProviderId` |
| `readonly profileIds` | `readonly string[]` |
| `parse(file` | `File, context?: AdapterParseContext): Promise<ChatArchive>` |

### `WhatsAppExportInput`
_Source: `frontend/src/features/chats/transfer/adapters/whatsapp.ts`_

| Field | Type |
| :--- | :--- |
| `filename` | `string` |
| `text` | `string` |
| `media` | `Map<string, Uint8Array>` |

### `ParsedLine`
_Source: `frontend/src/features/chats/transfer/adapters/whatsapp.ts`_

| Field | Type |
| :--- | :--- |
| `timestamp` | `string` |
| `author` | `string` |
| `text` | `string` |

### `ChatArchiveSource`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `providerId` | `ChatProviderId` |
| `profileId` | `string` |

### `ChatArchiveParticipant`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `sourceId` | `string` |
| `displayName` | `string` |
| `attributes` | `Record<string, string>` |

### `ChatArchiveReaction`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `emoji` | `string` |
| `participantIds` | `string[]` |

### `ChatArchiveMessage`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `sourceId` | `string` |
| `authorId` | `string` |
| `timestamp` | `string` |
| `kind` | `string` |
| `text` | `string` |
| `replyToSourceId` | `string` |
| `threadRootSourceId` | `string` |
| `attachmentIds` | `string[]` |
| `reactions` | `ChatArchiveReaction[]` |
| `isEdited` | `boolean` |
| `deletedAt` | `string` |
| `metadata` | `Record<string, unknown>` |

### `ChatArchiveAttachment`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `path` | `string` |
| `filename` | `string` |
| `mimeType` | `string` |
| `size` | `number` |
| `checksum` | `string` |
| `bytes` | `Uint8Array` |
| `externalUrl` | `string` |

### `ChatArchiveWarning`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `code` | `string` |
| `message` | `string` |

### `ChatArchive`
_Source: `frontend/src/features/chats/transfer/archive.ts`_

| Field | Type |
| :--- | :--- |
| `schemaVersion` | `1` |
| `source` | `ChatArchiveSource` |
| `exportedAt` | `string` |
| `conversation` | `{` |
| `sourceId` | `string` |
| `title` | `string` |
| `metadata` | `Record<string, unknown>` |

### `UseChatsPageControllerParams`
_Source: `frontend/src/features/chats/useChatsPageController.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string | undefined` |
| `location` | `Location` |
| `navigate` | `NavigateFunction` |
| `prefersReducedMotion` | `boolean` |
| `accessToken` | `string | null` |
| `currentUser` | `User | null` |
| `authRequest` | `<T>(path: string, init?: { method?: string; body?: unknown` |

### `UseResizableSidebarOptions`
_Source: `frontend/src/hooks/useResizableSidebar.ts`_

| Field | Type |
| :--- | :--- |
| `onCollapse` | `() => void` |
| `initialWidth` | `number` |
| `minWidth` | `number` |
| `maxWidth` | `number` |

### `LanguageContextValue`
_Source: `frontend/src/i18n/LanguageContext.tsx`_

| Field | Type |
| :--- | :--- |
| `language` | `LanguageChoice` |
| `resolvedLanguage` | `ResolvedLanguage` |
| `systemLanguage` | `ResolvedLanguage` |
| `strings` | `AppStrings` |
| `setLanguage` | `(choice: LanguageChoice) => void` |

### `LegalSection`
_Source: `frontend/src/legal/legalContent.ts`_

| Field | Type |
| :--- | :--- |
| `title` | `string` |
| `paragraphs` | `string[]` |
| `bullets` | `string[]` |

### `LegalDocument`
_Source: `frontend/src/legal/legalContent.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `LegalDocumentId` |
| `title` | `string` |
| `summary` | `string` |
| `updatedLabel` | `string` |
| `sections` | `LegalSection[]` |

### `Message`
_Source: `frontend/src/localReplicaReadAdapter.test.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; body: string` |

### `Chat`
_Source: `frontend/src/localReplicaReadAdapter.test.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string; title: string` |

### `ReplicaOperation`
_Source: `frontend/src/localReplicaReadAdapter.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `type` | `string` |
| `payloadJson` | `string` |
| `payloadHash` | `string` |
| `dependencies` | `string[]` |
| `status` | `ReplicaOperationStatus` |
| `attemptCount` | `number` |
| `createdAt` | `string` |
| `updatedAt` | `string` |
| `retryAt` | `string | null` |
| `errorCode` | `string | null` |

### `LocalReplicaSyncAdapter`
_Source: `frontend/src/localReplicaReadAdapter.ts`_

| Field | Type |
| :--- | :--- |
| `getCursor(profileId` | `string): Promise<string | null>` |
| `listOperations(profileId` | `string, statuses?: ReplicaOperationStatus[]): Promise<ReplicaOperation[]>` |

### `StoredResponse`
_Source: `frontend/src/mediaBlobCache.test.ts`_

| Field | Type |
| :--- | :--- |
| `body` | `ArrayBuffer; type: string; status: number; headers: Record<string, string>` |

### `CacheEntry`
_Source: `frontend/src/mediaBlobCache.ts`_

| Field | Type |
| :--- | :--- |
| `blob` | `Blob` |
| `objectUrl` | `string` |
| `lastAccess` | `number` |

### `StoredMediaPolicy`
_Source: `frontend/src/mediaDownloadPolicy.ts`_

| Field | Type |
| :--- | :--- |
| `autoDownloadMedia` | `unknown` |
| `autoDownloadLimitMB` | `unknown` |
| `autoDownloadWiFiOnly` | `unknown` |

### `ResolvedMediaPolicy`
_Source: `frontend/src/mediaDownloadPolicy.ts`_

| Field | Type |
| :--- | :--- |
| `autoDownloadMedia` | `boolean` |
| `autoDownloadLimitMB` | `number` |
| `autoDownloadWiFiOnly` | `boolean` |

### `ConnectionInfo`
_Source: `frontend/src/mediaDownloadPolicy.ts`_

| Field | Type |
| :--- | :--- |
| `saveData` | `boolean` |
| `type` | `string` |
| `effectiveType` | `string` |

### `RenderContext`
_Source: `frontend/src/messageMarkdown.tsx`_

| Field | Type |
| :--- | :--- |
| `suppressInteractions` | `boolean` |

### `MessageSearchOptions`
_Source: `frontend/src/messageSearch.ts`_

| Field | Type |
| :--- | :--- |
| `wholeWord` | `boolean` |
| `caseSensitive` | `boolean` |

### `AndroidLoginQR`
_Source: `frontend/src/native/androidQrLogin.ts`_

| Field | Type |
| :--- | :--- |
| `apiUrl` | `string` |
| `requestId` | `string` |

### `NativeAppLockPlugin`
_Source: `frontend/src/native/appLockPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `isAvailable()` | `Promise<{ available: boolean; biometrics: boolean; deviceCredential: boolean` |

### `AudioPlaybackPluginLoadOptions`
_Source: `frontend/src/native/audioPlaybackPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `messageId` | `string` |
| `fileId` | `string` |
| `sourceUrl` | `string` |
| `token` | `string` |
| `mimeType` | `string` |
| `startPosition` | `number` |

### `AudioPlaybackPluginNative`
_Source: `frontend/src/native/audioPlaybackPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `getState()` | `Promise<unknown>` |
| `load(options` | `AudioPlaybackPluginLoadOptions): Promise<unknown>` |
| `play()` | `Promise<unknown>` |
| `pause()` | `Promise<void>` |
| `seek(options` | `{ position: number` |

### `NativeBackgroundUploadPlugin`
_Source: `frontend/src/native/backgroundUploadPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `enqueue(options` | `{` |
| `profileId` | `string; operationId: string; sourceUri: string; apiUrl: string; accessToken: string` |
| `originalName` | `string; mimeType: string; sizeBytes: number; chatId?: string | null` |

### `BackgroundUploadStatus`
_Source: `frontend/src/native/backgroundUploadPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `status` | `"queued" | "reserved" | "validating" | "ready" | "failed" | string` |
| `uploadId` | `string` |
| `fileId` | `string` |
| `error` | `string` |

### `CallPluginNative`
_Source: `frontend/src/native/callPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `enableCallMode(options` | `{ earpiece: boolean` |

### `NativeVideoPictureInPictureState`
_Source: `frontend/src/native/callPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `active` | `boolean` |
| `playing` | `boolean` |
| `chatId` | `string` |
| `messageId` | `string` |
| `fileId` | `string` |
| `positionSeconds` | `number` |
| `durationSeconds` | `number` |
| `width` | `number` |
| `height` | `number` |
| `revision` | `number` |

### `PictureInPictureActionEvent`
_Source: `frontend/src/native/callPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `action` | `PictureInPictureAction` |
| `videoState` | `NativeVideoPictureInPictureState` |

### `PictureInPictureState`
_Source: `frontend/src/native/callPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `active` | `boolean` |
| `supported` | `boolean` |
| `eligible` | `boolean` |
| `owner` | `PictureInPictureOwner` |
| `requestedOwner` | `PictureInPictureOwner` |
| `activeOwner` | `PictureInPictureOwner` |
| `callActive` | `boolean` |
| `video` | `boolean` |
| `chatId` | `string | null` |
| `sessionId` | `string | null` |
| `acceptedRevision` | `number` |
| `videoState` | `NativeVideoPictureInPictureState | null` |
| `reason` | `string` |

### `LocalReplicaStatus`
_Source: `frontend/src/native/localReplicaPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `supported` | `boolean` |
| `keyReady` | `boolean` |
| `schemaVersion` | `number` |
| `replicaReady` | `boolean` |
| `migrationState` | `"scaffold" | "ready"` |

### `LocalReplicaOperation`
_Source: `frontend/src/native/localReplicaPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `type` | `string` |
| `payloadJson` | `string` |
| `payloadHash` | `string` |
| `dependencies` | `string[]` |
| `status` | `LocalReplicaOperationStatus` |
| `attemptCount` | `number` |
| `createdAt` | `string` |
| `updatedAt` | `string` |
| `retryAt` | `string | null` |
| `errorCode` | `string | null` |

### `NativeLocalReplicaPlugin`
_Source: `frontend/src/native/localReplicaPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `getStatus(options` | `{ profileId?: string` |

### `NativeMediaItem`
_Source: `frontend/src/native/mediaLibraryPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `uri` | `string` |
| `name` | `string` |
| `mimeType` | `string` |
| `durationMs` | `number` |
| `thumbnailPath` | `string` |

### `CachedMediaFile`
_Source: `frontend/src/native/mediaLibraryPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `path` | `string; name: string; mimeType: string` |

### `NativeMediaLibraryPlugin`
_Source: `frontend/src/native/mediaLibraryPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `listMedia(options` | `{ limit?: number; offset?: number; category?: NativeMediaCategory` |

### `NativeShareOptions`
_Source: `frontend/src/native/nativeSharePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `title` | `string` |
| `text` | `string` |
| `url` | `string` |
| `dialogTitle` | `string` |
| `imageBase64` | `string` |
| `imageName` | `string` |
| `mimeType` | `string` |

### `NativeSharePluginInterface`
_Source: `frontend/src/native/nativeSharePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `share(options` | `NativeShareOptions): Promise<{ shared: boolean` |

### `ShareContentOptions`
_Source: `frontend/src/native/nativeSharePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `title` | `string` |
| `text` | `string` |
| `url` | `string` |
| `dialogTitle` | `string` |
| `dataUrl` | `string` |
| `filename` | `string` |
| `mimeType` | `string` |

### `ShareContentResult`
_Source: `frontend/src/native/nativeSharePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `shared` | `boolean` |
| `cancelled` | `boolean` |
| `fallbackToCopy` | `boolean` |
| `error` | `string` |

### `ScreenFrameEvent`
_Source: `frontend/src/native/screenCapturePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `data` | `string; // base64 JPEG` |
| `width` | `number` |
| `height` | `number` |

### `ScreenCaptureStartResult`
_Source: `frontend/src/native/screenCapturePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `active` | `boolean` |
| `alreadyActive` | `boolean` |
| `width` | `number` |
| `height` | `number` |

### `ScreenCapturePluginResult`
_Source: `frontend/src/native/screenCapturePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `active` | `boolean` |

### `ScreenCapturePluginSupportedResult`
_Source: `frontend/src/native/screenCapturePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `supported` | `boolean` |

### `ScreenCapturePluginNative`
_Source: `frontend/src/native/screenCapturePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `isSupported()` | `Promise<ScreenCapturePluginSupportedResult>` |
| `start()` | `Promise<ScreenCaptureStartResult>` |
| `stop()` | `Promise<ScreenCapturePluginResult>` |
| `eventName` | `"screenFrame",` |
| `listener` | `(event: ScreenFrameEvent) => void` |
| `)` | `Promise<{ remove: () => Promise<void>` |

### `NativeSharedFile`
_Source: `frontend/src/native/shareReceiverPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `path` | `string` |
| `name` | `string` |
| `mimeType` | `string` |
| `sizeBytes` | `number` |

### `NativeShareReceiverPlugin`
_Source: `frontend/src/native/shareReceiverPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `consumePendingShares()` | `Promise<{ files: NativeSharedFile[]; skippedCount: number` |

### `ReceivedSharedFiles`
_Source: `frontend/src/native/shareReceiverPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `files` | `File[]` |
| `skippedCount` | `number` |

### `NativeVoiceRecordingPlugin`
_Source: `frontend/src/native/voiceRecordingPlugin.ts`_

| Field | Type |
| :--- | :--- |
| `start()` | `Promise<void>` |
| `stop()` | `Promise<{ path: string; name: string; mimeType: string` |

### `PluginStatus`
_Source: `frontend/src/pages/AdminPluginsPage.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string; name: string; enabled: boolean` |

### `PluginDetail`
_Source: `frontend/src/pages/AdminPluginsPage.tsx`_

| Field | Type |
| :--- | :--- |
| `name` | `"statistics" | "canvas" | "checklist"; description: "statisticsDescription" | "canvasDescription" | "checklistDescription"; icon: typeof BarChart3; eyebrow: "analytics" | "collaboration" | "tasks"; preview: "statistics" | "canvas" | "diagrams" | "checklist" | "generic"` |

### `NavTabsVisibility`
_Source: `frontend/src/pages/AppNav.tsx`_

| Field | Type |
| :--- | :--- |
| `chats` | `boolean` |
| `storage` | `boolean` |
| `plans` | `boolean` |
| `settings` | `boolean` |

### `CanvasBlock`
_Source: `frontend/src/pages/CanvasPage.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string; kind: BlockKind; record: Y.Map<unknown>` |

### `ExcalidrawAPI`
_Source: `frontend/src/pages/CanvasPage.tsx`_

| Field | Type |
| :--- | :--- |
| `updateScene` | `(scene: { elements: unknown[]` |

### `RemoteParticipantStream`
_Source: `frontend/src/pages/GuestMeetingPage.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `string; cameraStream: MediaStream | null; screenStream: MediaStream | null` |

### `IntelligenceConsentPageProps`
_Source: `frontend/src/pages/IntelligenceConsentPage.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |

### `ParsedConsentRequest`
_Source: `frontend/src/pages/IntelligenceConsentPage.tsx`_

| Field | Type |
| :--- | :--- |
| `flow` | `IntelligenceBrowserFlow` |
| `parameters` | `IntelligenceConsentParameters` |

### `PlanDetailsState`
_Source: `frontend/src/pages/PlansPage.tsx`_

| Field | Type |
| :--- | :--- |
| `planId` | `string; anchorRect: DOMRect` |

### `FakeTrack`
_Source: `frontend/src/pages/guestMeetingCameraTrackReplacement.test.ts`_

| Field | Type |
| :--- | :--- |
| `enabled` | `boolean; stop: ReturnType<typeof vi.fn>` |

### `FakeParticipant`
_Source: `frontend/src/pages/guestMeetingCameraTrackReplacement.test.ts`_

| Field | Type |
| :--- | :--- |
| `unpublishTrack` | `ReturnType<typeof vi.fn>` |
| `publishTrack` | `ReturnType<typeof vi.fn>` |

### `EmptyRoomTimeoutOptions`
_Source: `frontend/src/pages/guestMeetingEmptyRoomTimeout.ts`_

| Field | Type |
| :--- | :--- |
| `onWarning` | `() => void` |
| `onTimeout` | `() => void` |
| `timeoutMs` | `number` |
| `warningMs` | `number` |

### `Props`
_Source: `frontend/src/pages/settings/AppearanceControls.tsx`_

| Field | Type |
| :--- | :--- |
| `appearance` | `AppearanceSettings; strings: AppStrings; updateAppearance: Update` |

### `ThemePreset`
_Source: `frontend/src/pages/settings/AppearanceControls.tsx`_

| Field | Type |
| :--- | :--- |
| `id` | `"sunset" | "aurora" | "cyber" | "ocean" | "rose"` |
| `name` | `string` |
| `themeMode` | `"light" | "dark" | "amoled"` |
| `presetTone` | `"amber" | "green" | "purple" | "blue" | "rose"` |
| `messageFont` | `"rounded" | "sans" | "mono" | "serif" | "system"` |
| `bubbleShape` | `"rounded" | "soft" | "square"` |
| `bubbleRadius` | `number` |
| `wallpaper` | `"dots" | "aurora" | "paper" | "plain"` |

### `CustomSavedTheme`
_Source: `frontend/src/pages/settings/AppearanceControls.tsx`_

| Field | Type |
| :--- | :--- |
| `name` | `string` |
| `themeMode` | `"light" | "dark" | "amoled"` |
| `accent` | `"blue" | "green" | "purple" | "rose" | "amber" | "custom"` |
| `customAccent` | `string` |
| `wallpaper` | `WallpaperChoice` |
| `bubbleRadius` | `number` |
| `bubbleShape` | `BubbleShapeChoice` |
| `messageFont` | `MessageFontChoice` |
| `messageScale` | `number` |
| `variants` | `Array<"light" | "dark">` |

### `Props`
_Source: `frontend/src/pages/settings/FamilySettings.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings; members: User[]; canManageFamily: boolean` |

### `IntelligenceConnectionsSettingsProps`
_Source: `frontend/src/pages/settings/IntelligenceConnectionsSettings.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |
| `authRequest` | `IntelligenceAuthRequest` |

### `KeyboardShortcutsSettingsProps`
_Source: `frontend/src/pages/settings/KeyboardShortcutsSettings.tsx`_

| Field | Type |
| :--- | :--- |
| `showResetAll` | `boolean` |

### `Props`
_Source: `frontend/src/pages/settings/LanguageSettings.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |
| `language` | `LanguageChoice` |
| `systemLanguage` | `"en" | "ru"` |
| `onChange` | `(language: LanguageChoice) => void` |

### `Props`
_Source: `frontend/src/pages/settings/NotificationsSettings.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |
| `preferences` | `DevicePreferences` |
| `onUpdate` | `(updates: Partial<DevicePreferences>) => void` |

### `PrivacySecuritySettingsProps`
_Source: `frontend/src/pages/settings/PrivacySecuritySettings.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |
| `authRequest` | `IntelligenceAuthRequest` |
| `currentUser` | `User | null` |
| `members` | `User[]` |
| `blockedMemberIds` | `string[]` |
| `detail` | `PrivacyDetail` |
| `isSaving` | `boolean` |
| `appLockEnabled` | `boolean` |
| `canUseAppLock` | `boolean` |
| `onDetailChange` | `(detail: PrivacyDetail) => void` |
| `onUpdatePrivacy` | `(patch: Partial<Pick<User, "profileVisibility" | "lastSeenVisibility" | "readReceiptsEnabled" | "directMessagePermission" | "groupInvitePermission" | "channelInvitePermission" | "voiceInvitePermission" | "invitePermissionUserIds">>) => void` |
| `onAppLockChange` | `(enabled: boolean) => void` |
| `onToggleBlock` | `(member: User) => void` |
| `renderMemberAvatar` | `(member: User) => ReactNode` |

### `ProfileForm`
_Source: `frontend/src/pages/settings/ProfileSettingsTab.tsx`_

| Field | Type |
| :--- | :--- |
| `displayName` | `string` |
| `email` | `string` |
| `bio` | `string` |
| `timezone` | `string` |

### `PasswordForm`
_Source: `frontend/src/pages/settings/ProfileSettingsTab.tsx`_

| Field | Type |
| :--- | :--- |
| `currentPassword` | `string` |
| `newPassword` | `string` |
| `confirmation` | `string` |

### `AndroidQr`
_Source: `frontend/src/pages/settings/ProfileSettingsTab.tsx`_

| Field | Type |
| :--- | :--- |
| `image` | `string; expiresAt: string; remainingSeconds: number` |

### `Props`
_Source: `frontend/src/pages/settings/ProfileSettingsTab.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |
| `profileForm` | `ProfileForm` |
| `setProfileForm` | `Dispatch<SetStateAction<ProfileForm>>` |
| `passwordForm` | `PasswordForm` |
| `setPasswordForm` | `Dispatch<SetStateAction<PasswordForm>>` |
| `isSaving` | `boolean` |
| `accessToken` | `string | null` |
| `role` | `string` |
| `username` | `string` |
| `currentServerUrl` | `string` |
| `connectionLink` | `string` |
| `profilePhotoControl` | `ReactNode` |
| `notificationPreferences` | `Pick<DevicePreferences, "quietHoursEnabled" | "quietHoursStart" | "quietHoursEnd">` |
| `onProfileSubmit` | `(event: FormEvent) => void` |
| `onPasswordSubmit` | `(event: FormEvent) => void` |
| `onCopyConnection` | `() => void` |
| `onNotificationPreferencesUpdate` | `(updates: Partial<DevicePreferences>) => void` |

### `SettingsDashboardGroup`
_Source: `frontend/src/pages/settings/SettingsDashboard.tsx`_

| Field | Type |
| :--- | :--- |
| `title` | `string; items: Array<{ id: string; label: string; helper: string; icon: LucideIcon` |

### `Props`
_Source: `frontend/src/pages/settings/SettingsDashboard.tsx`_

| Field | Type |
| :--- | :--- |
| `strings` | `AppStrings` |
| `profilePhotoControl` | `ReactNode` |
| `profileName` | `string` |
| `role` | `string` |
| `groups` | `SettingsDashboardGroup[]` |
| `appearance` | `AppearanceSettings` |
| `appearanceHelper` | `string` |
| `onOpen` | `(item: string) => void` |

### `StorageFileLike`
_Source: `frontend/src/pages/storageLibrary.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `chatId` | `string | null` |
| `chatTitle` | `string | null` |
| `chatType` | `string | null` |
| `mimeType` | `string` |
| `isFavorite` | `boolean` |

### `StorageSelectionState`
_Source: `frontend/src/pages/storageSelection.ts`_

| Field | Type |
| :--- | :--- |
| `selectedFileId` | `string | null` |
| `mobileDetailsOpen` | `boolean` |

### `VoiceCallLayoutSnapshot`
_Source: `frontend/src/pages/voiceCallLayoutSnapshot.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string; isExpanded: boolean` |

### `TransitionInput`
_Source: `frontend/src/pages/voiceCallLayoutSnapshot.ts`_

| Field | Type |
| :--- | :--- |
| `callPhase` | `CallPhase` |
| `activeCallChatId` | `string | null` |
| `activeCallChatType` | `string | null` |
| `selectedChatId` | `string | undefined` |
| `isExpanded` | `boolean` |

### `TransitionResult`
_Source: `frontend/src/pages/voiceCallLayoutSnapshot.ts`_

| Field | Type |
| :--- | :--- |
| `snapshot` | `VoiceCallLayoutSnapshot | null` |
| `restoreExpanded` | `boolean | null` |

### `ScheduleCommandDraft`
_Source: `frontend/src/plans/scheduleCommand.ts`_

| Field | Type |
| :--- | :--- |
| `title` | `string` |
| `startsAt` | `string` |
| `durationMinutes` | `number` |

### `ThemeConfig`
_Source: `frontend/src/plugins/themePlugin.ts`_

| Field | Type |
| :--- | :--- |
| `name` | `ThemeName` |
| `displayName` | `string` |
| `cssVariables` | `Record<string, string>` |

### `SignalPayload`
_Source: `frontend/src/realtime/call/MeshMediaEngine.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `fromUserId` | `string` |
| `data` | `SignalData` |

### `PeerState`
_Source: `frontend/src/realtime/call/MeshMediaEngine.ts`_

| Field | Type |
| :--- | :--- |
| `pc` | `RTCPeerConnection` |
| `pendingCandidates` | `RTCIceCandidateInit[]` |
| `signalQueue` | `Promise<void>` |
| `remoteStream` | `MediaStream | null` |
| `screenStream` | `MediaStream | null` |
| `expectedScreenStreamId` | `string | null` |
| `screenSender` | `RTCRtpSender | null` |

### `CallQualitySettingsSource`
_Source: `frontend/src/realtime/call/callQuality.ts`_

| Field | Type |
| :--- | :--- |
| `cameraBitrateKbps` | `number | null` |
| `screenShareBitrateKbps` | `number | null` |
| `groupCallCameraBitrateKbps` | `number | null` |
| `groupCallScreenShareBitrateKbps` | `number | null` |
| `dmCallCameraBitrateKbps` | `number | null` |
| `dmCallScreenShareBitrateKbps` | `number | null` |

### `CallQualityBitrates`
_Source: `frontend/src/realtime/call/callQuality.ts`_

| Field | Type |
| :--- | :--- |
| `cameraBitrateKbps` | `number` |
| `screenShareBitrateKbps` | `number` |

### `CallSignalPayload`
_Source: `frontend/src/realtime/call/mediaEngineFactory.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `fromUserId` | `string` |
| `data` | `Record<string, unknown>` |

### `SFUMediaEnginePort`
_Source: `frontend/src/realtime/call/mediaEngineFactory.ts`_

| Field | Type |
| :--- | :--- |
| `onRemoteStream` | `(userId: string, stream: MediaStream) => void` |
| `onRemoteScreenStream` | `(userId: string, stream: MediaStream | null) => void` |
| `onRemoteStreamRemoved` | `(userId: string) => void` |
| `onRemoteMicrophoneMuteChange` | `(userId: string, muted: boolean) => void` |
| `onRemoteParticipantDisconnected` | `(userId: string) => void` |
| `onConnected` | `() => void` |
| `onDisconnected` | `() => void` |
| `connect(options` | `{ url: string; token: string` |

### `MediaEngineFactory`
_Source: `frontend/src/realtime/call/mediaEngineFactory.ts`_

| Field | Type |
| :--- | :--- |
| `createMesh(socket` | `Socket, accessToken: string): MeshMediaEnginePort` |
| `createSFU()` | `SFUMediaEnginePort` |

### `CallParticipantInfo`
_Source: `frontend/src/realtime/call/types.ts`_

| Field | Type |
| :--- | :--- |
| `userId` | `string` |
| `role` | `"host" | "member" | string` |
| `state` | `CallParticipantState | string` |
| `joinedAt` | `string` |

### `RemoteMedia`
_Source: `frontend/src/realtime/call/types.ts`_

| Field | Type |
| :--- | :--- |
| `userId` | `string` |
| `stream` | `MediaStream` |
| `screenStream` | `MediaStream | null` |
| `hasVideo` | `boolean` |
| `hasAudio` | `boolean` |
| `hasScreenShare` | `boolean` |
| `isMuted` | `boolean` |

### `CallSettings`
_Source: `frontend/src/realtime/call/types.ts`_

| Field | Type |
| :--- | :--- |
| `micMuted` | `boolean` |
| `soundDisabled` | `boolean` |
| `cameraEnabled` | `boolean` |
| `screenSharing` | `boolean` |
| `cameraFacingMode` | `"user" | "environment"` |
| `speakerMode` | `"small" | "large"` |
| `inputDeviceId` | `string` |
| `outputDeviceId` | `string` |
| `videoDeviceId` | `string` |
| `echoCancellation` | `boolean` |
| `noiseSuppression` | `boolean` |
| `autoGainControl` | `boolean` |
| `voiceEnhancement` | `boolean` |
| `inputGain` | `number` |
| `speakingSensitivity` | `number` |
| `outputVolume` | `number` |
| `voiceEnhancementThreshold` | `number` |
| `voiceEnhancementHighpass` | `number` |
| `mirrorLocalVideo` | `boolean` |

### `CallDevice`
_Source: `frontend/src/realtime/call/types.ts`_

| Field | Type |
| :--- | :--- |
| `deviceId` | `string` |
| `kind` | `"audioinput" | "audiooutput" | "videoinput"` |
| `label` | `string` |

### `CallCapabilities`
_Source: `frontend/src/realtime/call/types.ts`_

| Field | Type |
| :--- | :--- |
| `canSelectInputDevice` | `boolean` |
| `canSelectOutputDevice` | `boolean` |
| `canUseNoiseSuppression` | `boolean` |
| `canUseEchoCancellation` | `boolean` |
| `canUseAutoGainControl` | `boolean` |
| `canUseVoiceEnhancement` | `boolean` |
| `canUseCamera` | `boolean` |
| `canShareScreen` | `boolean` |

### `SocketConnection`
_Source: `frontend/src/realtime/socketConnection.ts`_

| Field | Type |
| :--- | :--- |
| `connected` | `boolean` |
| `active` | `boolean` |
| `connect` | `() => unknown` |
| `disconnect` | `() => unknown` |
| `on` | `(event: "connect", listener: () => void) => unknown` |
| `off` | `(event: "connect", listener: () => void) => unknown` |

### `WaitForSocketConnectionOptions`
_Source: `frontend/src/realtime/socketConnection.ts`_

| Field | Type |
| :--- | :--- |
| `attempts` | `number` |
| `attemptTimeoutMs` | `number` |
| `retryDelayMs` | `number` |
| `onAttempt` | `(attempt: number, totalAttempts: number) => void` |

### `DevicePreferences`
_Source: `frontend/src/settings/devicePreferences.ts`_

| Field | Type |
| :--- | :--- |
| `messageNotifications` | `boolean` |
| `messagePreview` | `boolean` |
| `messageSound` | `boolean` |
| `callNotifications` | `boolean` |
| `ringtoneEnabled` | `boolean` |
| `quietHoursEnabled` | `boolean` |
| `quietHoursStart` | `string` |
| `quietHoursEnd` | `string` |
| `appLockEnabled` | `boolean` |
| `language` | `LanguageChoice` |

### `QueuedSharedFiles`
_Source: `frontend/src/sharedFileQueue.ts`_

| Field | Type |
| :--- | :--- |
| `files` | `File[]` |
| `skippedCount` | `number` |

### `KeyboardShortcutsContextValue`
_Source: `frontend/src/shortcuts/KeyboardShortcutsContext.tsx`_

| Field | Type |
| :--- | :--- |
| `bindings` | `ShortcutBindings` |
| `isQuickSwitcherOpen` | `boolean` |
| `openQuickSwitcher` | `() => void` |
| `closeQuickSwitcher` | `() => void` |
| `registerShortcutHandler` | `(actionId: ShortcutActionId, handler: ShortcutHandler) => () => void` |

### `ShortcutDefinition`
_Source: `frontend/src/shortcuts/types.ts`_

| Field | Type |
| :--- | :--- |
| `id` | `ShortcutActionId` |
| `category` | `ShortcutCategory` |
| `defaultBinding` | `string` |
| `scope` | `ShortcutScope` |

### `CustomShortcutConflict`
_Source: `frontend/src/shortcuts/types.ts`_

| Field | Type |
| :--- | :--- |
| `actionId` | `ShortcutActionId` |
| `conflictingActionId` | `ShortcutActionId` |
| `combo` | `string` |

### `NativeVideoDimensions`
_Source: `frontend/src/videoPiPBridge.ts`_

| Field | Type |
| :--- | :--- |
| `width` | `number` |
| `height` | `number` |

### `VideoPiPRestoreTarget`
_Source: `frontend/src/videoPiPBridge.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `VideoIdentity` |
| `currentTime` | `number` |
| `duration` | `number` |
| `playing` | `boolean` |
| `revision` | `number` |

### `AudioSnapshot`
_Source: `frontend/src/videoPlaybackSession.test.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `{ chatId: string; messageId: string; fileId: string` |

### `VideoIdentity`
_Source: `frontend/src/videoPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `chatId` | `string` |
| `messageId` | `string` |
| `fileId` | `string` |

### `VideoPlaybackSnapshot`
_Source: `frontend/src/videoPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `VideoIdentity` |
| `currentTime` | `number` |
| `duration` | `number` |
| `muted` | `boolean` |
| `playIntent` | `boolean` |
| `status` | `VideoPlaybackStatus` |
| `error` | `string | null` |
| `revision` | `number` |

### `VideoPlaybackRegistration`
_Source: `frontend/src/videoPlaybackSession.ts`_

| Field | Type |
| :--- | :--- |
| `identity` | `VideoIdentity` |
| `token` | `number` |
| `snapshot` | `VideoPlaybackSnapshot` |

### `VoiceRecorderHandle`
_Source: `frontend/src/voiceRecording.ts`_

| Field | Type |
| :--- | :--- |
| `stop` | `() => Promise<File>` |
| `cancel` | `() => void` |

<!-- okf:generated:end -->
