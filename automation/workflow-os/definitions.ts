import { Workflow } from "./types";

export const workflows: Workflow[] = [
  { id: "A-membership", name: "Membership", scope: "community", steps: [
    { id: "register", handler: "auth.register" },
    { id: "verify-email", handler: "auth.verifyEmail" },
    { id: "find-class", handler: "community.find" },
    { id: "apply", handler: "membership.apply" },
    { id: "review", handler: "membership.review", permission: "membership.review", approval: { role: "class_admin" } },
    { id: "approve", handler: "membership.approve", permission: "membership.approve" },
    { id: "dashboard", handler: "member.openDashboard" } ] },
  { id: "B-profile", name: "Profile", scope: "community", steps: [
    { id: "create", handler: "profile.create" },
    { id: "academic", handler: "profile.addAcademic" },
    { id: "career", handler: "profile.addCareer" },
    { id: "privacy", handler: "profile.setPrivacy" },
    { id: "publish", handler: "profile.publish" } ] },
  { id: "C-business", name: "Business", scope: "community", steps: [
    { id: "create", handler: "business.create" },
    { id: "services", handler: "business.addServices" },
    { id: "submit", handler: "business.submit" },
    { id: "review", handler: "business.review", permission: "business.review", approval: { role: "class_admin" } },
    { id: "list", handler: "business.list" } ] },
  { id: "D-events", name: "Events", scope: "community", steps: [
    { id: "create", handler: "event.create", permission: "event.create" },
    { id: "discover", handler: "event.publish" },
    { id: "rsvp", handler: "event.rsvp" },
    { id: "attendance", handler: "event.trackAttendance", permission: "event.manage" } ] },
  { id: "E-administration", name: "Administration", scope: "platform", steps: [
    { id: "verify-community", handler: "community.verify", permission: "community.create" },
    { id: "assign-admin", handler: "role.assign", permission: "role.assign", approval: { role: "platform_admin" } },
    { id: "manage", handler: "community.handover" } ] },
];
