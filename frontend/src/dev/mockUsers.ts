import type { User } from "../api/auth";

export const DEMO_FAMILY_ID = "family-stovo-demo";
export const DEMO_USER_ID = "user-stovo-demo";

export const demoOwner: User = {
  id: DEMO_USER_ID,
  familyId: DEMO_FAMILY_ID,
  username: "stovo.demo",
  displayName: "Stovo Demo",
  role: "owner",
  isActive: true,
  publicKey: null,
  profilePhoto: null,
  createdAt: "2026-10-01T09:00:00.000Z",
  lastSeenAt: "2026-10-09T08:45:00.000Z",
  profileVisibility: "family",
  lastSeenVisibility: "family",
  readReceiptsEnabled: true,
  directMessagePermission: "family",
  groupInvitePermission: "allow",
  channelInvitePermission: "allow",
  voiceInvitePermission: "allow",
  invitePermissionUserIds: [],
  bio: "Synthetic account for the local Stovo UI preview.",
  timezone: "Asia/Bishkek",
};

export const demoAlex: User = {
  id: "user-alex-rivera",
  familyId: DEMO_FAMILY_ID,
  username: "alex.rivera",
  displayName: "Alex Rivera",
  role: "admin",
  isActive: true,
  publicKey: null,
  profilePhoto: null,
  createdAt: "2026-10-01T09:10:00.000Z",
  lastSeenAt: "2026-10-09T08:42:00.000Z",
  profileVisibility: "family",
  lastSeenVisibility: "family",
  readReceiptsEnabled: true,
  directMessagePermission: "family",
  groupInvitePermission: "allow",
  channelInvitePermission: "allow",
  voiceInvitePermission: "allow",
  invitePermissionUserIds: [],
  bio: "Keeps the project plan moving.",
  timezone: "Asia/Bishkek",
};

export const demoMaya: User = {
  id: "user-maya-chen",
  familyId: DEMO_FAMILY_ID,
  username: "maya.chen",
  displayName: "Maya Chen",
  role: "member",
  isActive: true,
  publicKey: null,
  profilePhoto: null,
  createdAt: "2026-10-01T09:20:00.000Z",
  lastSeenAt: "2026-10-09T08:30:00.000Z",
  profileVisibility: "family",
  lastSeenVisibility: "family",
  readReceiptsEnabled: true,
  directMessagePermission: "family",
  groupInvitePermission: "allow",
  channelInvitePermission: "allow",
  voiceInvitePermission: "allow",
  invitePermissionUserIds: [],
  bio: "Shares notes and design reviews.",
  timezone: "Asia/Bishkek",
};

export const demoSam: User = {
  id: "user-sam-patel",
  familyId: DEMO_FAMILY_ID,
  username: "sam.patel",
  displayName: "Sam Patel",
  role: "member",
  isActive: true,
  publicKey: null,
  profilePhoto: null,
  createdAt: "2026-10-01T09:30:00.000Z",
  lastSeenAt: "2026-10-09T08:15:00.000Z",
  profileVisibility: "family",
  lastSeenVisibility: "family",
  readReceiptsEnabled: true,
  directMessagePermission: "family",
  groupInvitePermission: "allow",
  channelInvitePermission: "allow",
  voiceInvitePermission: "allow",
  invitePermissionUserIds: [],
  bio: "Collects decisions and follow-ups.",
  timezone: "Asia/Bishkek",
};

export const demoUser: User = demoOwner;

export const demoUsers: User[] = [demoOwner, demoAlex, demoMaya, demoSam];
