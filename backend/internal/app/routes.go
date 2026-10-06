package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"stovo-messenger/backend/internal/cache"
	featurefamily "stovo-messenger/backend/internal/features/family"
	"stovo-messenger/backend/internal/features/identity"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	featureplans "stovo-messenger/backend/internal/features/plans"
	featurepreferences "stovo-messenger/backend/internal/features/preferences"
	featureprivacy "stovo-messenger/backend/internal/features/privacy"
	"stovo-messenger/backend/internal/plugins"
	httptransport "stovo-messenger/backend/internal/transport/http"
	chatpresenter "stovo-messenger/backend/internal/transport/http/presenter"
)

var errAttachmentSenderOnly = errors.New("only the sender can attach files")

func (s *Server) callRoutes() httptransport.CallRoutes {
	sfu := s.sfuHandler()
	transcription := s.transcriptionHTTPHandler()
	return httptransport.CallRoutes{
		GetICEServers: s.authenticated(s.handleGetIceServers),
		CreateSFUToken: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			sfu.CreateToken(w, r, httptransport.SFUTokenActor{ID: user.ID, DisplayName: user.DisplayName})
		}),
		StartTranscription: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.Start(w, r, httptransport.TranscriptionActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		StopTranscription: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.Stop(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		GetTranscriptionStatus: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.Status(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		GetTranscript: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.Transcript(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		RequestTranscriptionUpload: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.RequestUpload(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		UploadAudioChunkData: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.UploadData(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		CompleteTranscriptionUpload: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.CompleteUpload(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		UpdateTranscriptSegment: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.UpdateSegment(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		GetTranscriptArtifact: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			transcription.Artifact(w, r, httptransport.TranscriptionActor{ID: user.ID, Role: user.Role, DisplayName: user.DisplayName})
		}),
		StartRecording:     s.authenticated(s.handleStartRecording),
		StopRecording:      s.authenticated(s.handleStopRecording),
		GetRecordingStatus: s.authenticated(s.handleGetRecordingStatus),
		UploadRecording:    s.authenticated(s.handleUploadRecording),
		FailRecording:      s.authenticated(s.handleFailRecording),
		TranscribeCaptions: s.authenticated(s.handleTranscribeCaptions),
	}
}
func (s *Server) authRoutes() httptransport.AuthRoutes {
	privacy := httptransport.NewPrivacyHandler(httptransport.PrivacyOperations[userPublic]{
		Privacy: s.privacy,
		LookupUser: func(ctx context.Context, id string) (userPublic, error) {
			return s.getUserByID(id)
		},
		ExtractMember: func(user userPublic) featureprivacy.Member {
			return featureprivacy.Member{ID: user.ID, FamilyID: user.FamilyID, Active: user.IsActive}
		},
	})
	preferences := NewAccountPreferencesHandler(s.preferences, s.cfg.AppURL, s.decodeJSON)
	me := httptransport.NewMeHandler()
	return httptransport.AuthRoutes{
		SetupStatus: s.setupStatusHandler(),
		Setup: httptransport.SetupHandler{
			Process:  s.processSetup,
			ClientIP: s.getClientIP,
			WriteSuccess: func(w http.ResponseWriter, r *http.Request, status int, response any) {
				s.writeAuthSuccess(w, r, status, response.(httptransport.AuthSuccess[userPublic]))
			},
		},
		Login: httptransport.LoginHandler{
			ClientIP: s.getClientIP,
			Authenticate: func(ctx context.Context, username, password, clientIP string) (any, int, string) {
				if _, err := cache.NewRateLimitService(s.cache).CheckLogin(ctx, clientIP); err != nil {
					var limitErr cache.RateLimitExceededError
					if errors.As(err, &limitErr) {
						return nil, http.StatusTooManyRequests, "Rate limit exceeded"
					}
					return nil, http.StatusInternalServerError, "Could not verify rate limit"
				}
				user, passwordHash, err := s.getUserForLogin(ctx, username)
				if err != nil || !verifyPassword(password, passwordHash) || !user.IsActive {
					return nil, http.StatusUnauthorized, "Invalid credentials"
				}
				banned, err := s.isFamilyIPBanned(ctx, user.FamilyID, clientIP)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not verify sign-in"
				}
				if banned {
					return nil, http.StatusUnauthorized, "Invalid credentials"
				}
				token, tokenHash, expiresAt, err := s.issueRefreshToken(user.ID)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not create session"
				}
				if err := s.sessionWriter.CreateSession(ctx, identity.PersistedSession{ID: uuid.NewString(), UserID: user.ID, TokenHash: tokenHash, ExpiresAt: expiresAt, CreatedAt: nowString(), IPAddress: clientIP}); err != nil {
					return nil, http.StatusInternalServerError, "Could not save session"
				}
				accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not create access token"
				}
				return httptransport.AuthSuccess[userPublic]{AccessToken: accessToken, TokenType: "Bearer", ExpiresInSeconds: expiresInSeconds, User: user, RefreshToken: token}, 0, ""
			},
			WriteSuccess: func(w http.ResponseWriter, r *http.Request, response any) {
				s.writeAuthSuccess(w, r, http.StatusOK, response.(httptransport.AuthSuccess[userPublic]))
			},
		},
		DeviceLoginRequest: http.HandlerFunc(httptransport.DeviceLoginHandler{
			ClientIP: s.getClientIP,
			Request: func(ctx context.Context, username, clientIP string) (any, int, string) {
				if count, err := s.cache.Increment(ctx, "rate-limit:device-login:"+clientIP, 60); err != nil || count > 5 {
					return nil, http.StatusTooManyRequests, "Please wait before requesting another code"
				}
				user, _, err := s.getUserForLogin(ctx, username)
				if err != nil || !user.IsActive {
					return map[string]string{"status": "If the account exists, a code was sent to Message Archive"}, 0, ""
				}
				code, err := newDeviceLoginCode()
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not create verification code"
				}
				if err := s.cache.Set(ctx, deviceLoginCacheKey(user.ID), map[string]string{"codeHash": deviceLoginCodeHash(code)}, deviceLoginCodeTTLSeconds); err != nil {
					return nil, http.StatusInternalServerError, "Could not save verification code"
				}
				archive, err := s.ensureMessageArchive(user)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not open Message Archive"
				}
				content := fmt.Sprintf("New device sign-in code: %s\nIt expires in 10 minutes. Do not share this code.", code)
				if _, err := s.createMessageWithPayloadContext(ctx, user, archive.ID, sendMessageRequest{Content: &content}, nil, nil); err != nil {
					return nil, http.StatusInternalServerError, "Could not deliver verification code"
				}
				return map[string]string{"status": "Verification code sent to Message Archive"}, 0, ""
			},
		}.RequestCode),
		DeviceLoginVerify: http.HandlerFunc(httptransport.DeviceLoginHandler{
			ClientIP: s.getClientIP,
			Verify: func(ctx context.Context, username, code, clientIP string) (any, int, string) {
				user, _, err := s.getUserForLogin(ctx, username)
				if err != nil || !user.IsActive {
					return nil, http.StatusUnauthorized, "Invalid verification code"
				}
				banned, err := s.isFamilyIPBanned(ctx, user.FamilyID, clientIP)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not verify sign-in"
				}
				if banned {
					return nil, http.StatusUnauthorized, "Invalid verification code"
				}
				stored, err := s.cache.Get(ctx, deviceLoginCacheKey(user.ID))
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not verify code"
				}
				data, ok := stored.(map[string]any)
				hash, okHash := data["codeHash"].(string)
				if !ok || !okHash || !identity.DeviceLoginCodeMatches(hash, code, deviceLoginCodeHash) {
					return nil, http.StatusUnauthorized, "Invalid or expired verification code"
				}
				if err := s.cache.Delete(ctx, deviceLoginCacheKey(user.ID)); err != nil {
					return nil, http.StatusInternalServerError, "Could not complete verification"
				}
				token, tokenHash, expiresAt, err := s.issueRefreshToken(user.ID)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not create session"
				}
				if err := s.sessionWriter.CreateSession(ctx, identity.PersistedSession{ID: uuid.NewString(), UserID: user.ID, TokenHash: tokenHash, ExpiresAt: expiresAt, CreatedAt: nowString(), IPAddress: clientIP}); err != nil {
					return nil, http.StatusInternalServerError, "Could not save session"
				}
				accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not create access token"
				}
				return httptransport.AuthSuccess[userPublic]{AccessToken: accessToken, TokenType: "Bearer", ExpiresInSeconds: expiresInSeconds, User: user, RefreshToken: token}, 0, ""
			},
			WriteSuccess: func(w http.ResponseWriter, r *http.Request, response any) {
				s.writeAuthSuccess(w, r, http.StatusOK, response.(httptransport.AuthSuccess[userPublic]))
			},
		}.VerifyCode),
		PasskeyRegistrationOptions: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.passkeyRegistrationOptions(w, r, user)
		}),
		PasskeyRegistrationVerify: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.passkeyRegistrationVerify(w, r, user)
		}),
		PasskeyAuthenticationOptions: http.HandlerFunc(s.passkeyAuthenticationOptions),
		PasskeyAuthenticationVerify:  http.HandlerFunc(s.passkeyAuthenticationVerify),
		QRLoginCreate:                http.HandlerFunc(s.createQRLogin),
		QRLoginStatus:                http.HandlerFunc(s.qrLoginStatus),
		QRLoginApprove: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.approveQRLogin(w, r, user)
		}),
		QRLoginReject: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.rejectQRLogin(w, r, user)
		}),
		Refresh: httptransport.NewRefreshHandler(httptransport.RefreshOperations{
			RefreshCookieName: s.cfg.RefreshCookieName,
			ClientIP:          s.getClientIP,
			ClearCookie:       s.clearRefreshCookie,
			Rotate: func(ctx context.Context, rawToken, clientIP string) (any, int, string) {
				user, nextToken, err := s.rotateRefreshToken(ctx, rawToken, clientIP)
				if err != nil {
					return nil, http.StatusUnauthorized, "Invalid refresh token"
				}
				accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not create access token"
				}
				return httptransport.AuthSuccess[userPublic]{AccessToken: accessToken, TokenType: "Bearer", ExpiresInSeconds: expiresInSeconds, User: user, RefreshToken: nextToken}, 0, ""
			},
			WriteSuccess: func(w http.ResponseWriter, r *http.Request, response any) {
				s.writeAuthSuccess(w, r, http.StatusOK, response.(httptransport.AuthSuccess[userPublic]))
			},
		}),
		Logout: httptransport.NewLogoutHandler(httptransport.LogoutOperations{
			RefreshCookieName: s.cfg.RefreshCookieName,
			Revoke:            s.revokeRefreshToken,
			ClearCookie:       s.clearRefreshCookie,
		}),
		Me: s.authenticated(func(w http.ResponseWriter, _ *http.Request, user userPublic) {
			me.Write(w, user)
		}),
		UpdateMe: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			handler := httptransport.ProfileUpdateHandler{
				Validate: func(ctx context.Context, payload httptransport.ProfileUpdateRequest) (int, string, error) {
					if payload.ProfilePhotoFileID != nil && *payload.ProfilePhotoFileID != "" {
						if err := s.validateImageFileForFamily(*payload.ProfilePhotoFileID, user, "Profile photo not found"); err != nil {
							return domainErrorStatus(err), err.Error(), err
						}
					}
					if errors.Is(identity.ValidateProfileVisibility(payload.ProfileVisibility, payload.LastSeenVisibility), identity.ErrInvalidVisibility) {
						return http.StatusUnprocessableEntity, "Visibility must be family or nobody", identity.ErrInvalidVisibility
					}
					privacy := featurepreferences.ContactPrivacyPatch{DirectMessagePermission: payload.DirectMessagePermission, GroupInvitePermission: payload.GroupInvitePermission, ChannelInvitePermission: payload.ChannelInvitePermission, VoiceInvitePermission: payload.VoiceInvitePermission, InvitePermissionUserIDs: payload.InvitePermissionUserIDs}
					if err := featurepreferences.ValidateContactPrivacyPatch(privacy); err != nil {
						return http.StatusUnprocessableEntity, err.Error(), err
					}
					return 0, "", nil
				},
				Update: func(ctx context.Context, payload httptransport.ProfileUpdateRequest) (any, error) {
					return s.updateProfileForUser(ctx, user, payload)
				},
			}
			handler.ServeHTTP(w, r)
		}),
		ChangePassword: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.PasswordChangeHandler{RefreshCookieName: s.cfg.RefreshCookieName,
				Change: func(ctx context.Context, payload httptransport.PasswordChangeRequest, rawToken string) (int, string, error) {
					return s.changePasswordForUser(ctx, user, payload, rawToken)
				},
			}.ServeHTTP(w, r)
		}),
		ListBlocks: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			privacy.ListBlocks(user).ServeHTTP(w, r)
		}),
		BlockUser: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			privacy.BlockUser(user).ServeHTTP(w, r)
		}),
		UnblockUser: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			privacy.UnblockUser(user).ServeHTTP(w, r)
		}),
		GetAudioSettings:      s.authenticated(preferences.handleGetAudioSettings),
		PutAudioSettings:      s.authenticated(preferences.handlePutAudioSettings),
		GetNotificationTopic:  s.authenticated(preferences.handleGetNotificationTopic),
		RegisterDeviceToken:   s.authenticated(preferences.handleRegisterDeviceToken),
		UnregisterDeviceToken: s.authenticated(preferences.handleUnregisterDeviceToken),
	}
}

func (s *Server) setupStatusHandler() http.Handler {
	handler := httptransport.NewSetupStatusHandler(httptransport.SetupStatusOperations{
		Load: func(ctx context.Context) (httptransport.SetupStatus, error) {
			status, err := s.setupStatus.Load(ctx)
			return httptransport.SetupStatus{
				ActiveUserCount: status.ActiveUserCount,
				FamilyName:      status.FamilyName,
			}, err
		},
		NavTabs: func() any {
			navTabs := parseNavTabsEnv()
			return &navTabs
		},
		LogError: func(operation string, err error) { s.logger.Errorf("auth", "%s error=%v", operation, err) },
	})
	return handler
}

func (s *Server) familyRoutes() httptransport.FamilyRoutes {
	plans := httptransport.NewPlanHTTPHandler(s.plans, s.decodeJSON, func(ctx context.Context, familyID, event string, payload any) {
		if plan, ok := payload.(featureplans.Plan); ok {
			s.emitPlanEvent(ctx, familyID, event, planFromFeature(plan))
		}
	})
	familyRead := httptransport.NewFamilyReadHandler(httptransport.FamilyReadOperations{
		Load: func(ctx context.Context, familyID string) (httptransport.Family, error) {
			family, err := s.getFamily(familyID)
			if err != nil {
				return httptransport.Family{}, err
			}
			defaults, err := s.familyDefaults.Get(ctx, familyID)
			if err != nil {
				return httptransport.Family{}, err
			}
			quality, err := s.callMediaQualityForFamily(ctx, familyID)
			if err != nil {
				return httptransport.Family{}, err
			}
			aiFeatures, err := s.familyAIFeatureSettings(ctx, familyID)
			if err != nil {
				return httptransport.Family{}, err
			}
			return httptransport.Family{
				ID: family.ID, Name: family.Name, StorageLimitMB: family.StorageLimitMB, MinimizedChatLayout: family.MinimizedChatLayout,
				DefaultMessageEncryptionProtocol: family.DefaultMessageEncryptionProtocol,
				DefaultProfileVisibility:         defaults.ProfileVisibility, DefaultLastSeenVisibility: defaults.LastSeenVisibility,
				DefaultReadReceiptsEnabled: defaults.ReadReceiptsEnabled, DefaultNotificationSettings: defaults.NotificationSettings,
				TranslationEnabled: aiFeatures.Translation, CallRecordingEnabled: aiFeatures.CallRecording,
				AINotesEnabled: aiFeatures.AINotes, VoiceTranscriptionEnabled: aiFeatures.VoiceTranscription,
				ScreenShareBitrateKbps:          quality.ScreenShareBitrateKbps,
				CameraBitrateKbps:               quality.CameraBitrateKbps,
				GroupCallScreenShareBitrateKbps: quality.GroupCallScreenShareBitrateKbps,
				GroupCallCameraBitrateKbps:      quality.GroupCallCameraBitrateKbps,
				DMCallScreenShareBitrateKbps:    quality.DMCallScreenShareBitrateKbps,
				DMCallCameraBitrateKbps:         quality.DMCallCameraBitrateKbps,
				NavTabs:                         httptransport.NavTabs{Chats: family.NavTabs.Chats, Storage: family.NavTabs.Storage, Plans: family.NavTabs.Plans, Settings: family.NavTabs.Settings},
			}, nil
		},
		IsNotFound: func(err error) bool { return errors.Is(err, errNotFound) },
		LogError:   func(operation string, err error) { s.logger.Errorf("family", "%s error=%v", operation, err) },
	})
	familyUpdate := httptransport.NewFamilyUpdateHandler(httptransport.FamilyUpdateOperations{
		IsAdmin: func(actor httptransport.FamilyUpdateActor) bool {
			return actor.Role == adminRole || hasPermission(userPublic{Role: actor.Role, Permissions: actor.Permissions}, permissionManageServer)
		},
		IsOwner: func(actor httptransport.FamilyUpdateActor) bool { return actor.Role == ownerRole },
		ValidVisibility: func(profile, lastSeen *string) bool {
			return !errors.Is(identity.ValidateFamilyDefaultVisibility(profile, lastSeen), identity.ErrInvalidFamilyVisibility)
		},
		ValidNotificationSettings: featurepreferences.ValidDefaultNotificationSettings,
		Update: func(ctx context.Context, familyID string, payload httptransport.FamilyUpdateRequest) (any, error) {
			if err := s.familyProfile.Update(ctx, familyID, featurefamily.ProfilePatch{Name: payload.Name, StorageLimitMB: payload.StorageLimitMB, MinimizedChatLayout: payload.MinimizedChatLayout, UpdatedAt: nowString()}); err != nil {
				return nil, err
			}
			if payload.DefaultProfileVisibility != nil || payload.DefaultLastSeenVisibility != nil || payload.DefaultReadReceiptsEnabled != nil || payload.DefaultNotificationSettings != nil {
				if _, err := s.familyDefaults.Update(ctx, familyID, featurefamily.MemberDefaultsPatch{ProfileVisibility: payload.DefaultProfileVisibility, LastSeenVisibility: payload.DefaultLastSeenVisibility, ReadReceiptsEnabled: payload.DefaultReadReceiptsEnabled, NotificationSettings: payload.DefaultNotificationSettings}); err != nil {
					return nil, err
				}
			}
			if payload.TranslationEnabled != nil || payload.CallRecordingEnabled != nil || payload.AINotesEnabled != nil || payload.VoiceTranscriptionEnabled != nil {
				if err := s.updateFamilyAIFeatureSettings(ctx, familyID, familyAIFeaturePatch{
					Translation: payload.TranslationEnabled, CallRecording: payload.CallRecordingEnabled,
					AINotes: payload.AINotesEnabled, VoiceTranscription: payload.VoiceTranscriptionEnabled,
				}); err != nil {
					return nil, err
				}
			}
			if payload.ScreenShareBitrateKbps != nil || payload.CameraBitrateKbps != nil || payload.GroupCallScreenShareBitrateKbps != nil || payload.GroupCallCameraBitrateKbps != nil || payload.DMCallScreenShareBitrateKbps != nil || payload.DMCallCameraBitrateKbps != nil {
				qualityPatch := map[string]*int{
					"screenShareBitrateKbps":          payload.ScreenShareBitrateKbps,
					"cameraBitrateKbps":               payload.CameraBitrateKbps,
					"groupCallScreenShareBitrateKbps": payload.GroupCallScreenShareBitrateKbps,
					"groupCallCameraBitrateKbps":      payload.GroupCallCameraBitrateKbps,
					"dmCallScreenShareBitrateKbps":    payload.DMCallScreenShareBitrateKbps,
					"dmCallCameraBitrateKbps":         payload.DMCallCameraBitrateKbps,
				}
				if err := s.updateCallMediaQualityForFamily(ctx, familyID, qualityPatch); err != nil {
					return nil, err
				}
			}
			return s.getFamily(familyID)
		},
	})
	roleHandler := httptransport.NewRoleHandler(httptransport.RoleOperations{
		List: s.roles.List, Get: s.roles.Get, Create: s.roles.Create, Update: s.roles.Update,
		DeleteReplacingMembers: s.roles.DeleteReplacingMembers,
		NewID:                  uuid.NewString, Now: nowString,
		LogError: func(operation string, err error) {
			s.logger.Errorf("roles", "%s error=%v", operation, err)
		},
	})
	roleActor := func(user userPublic) httptransport.RoleActor {
		return httptransport.RoleActor{FamilyID: user.FamilyID, Owner: user.Role == ownerRole, Permissions: user.Permissions}
	}
	return httptransport.FamilyRoutes{
		GetFamily: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			familyRead.GetFamily(w, r, user.FamilyID)
		}),
		UpdateFamily: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			familyUpdate.Update(w, r, httptransport.FamilyUpdateActor{FamilyID: user.FamilyID, Role: user.Role, Permissions: user.Permissions})
		}),
		GetMembers: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FamilyMemberHandler{List: func(ctx context.Context) (any, error) {
				rows, err := s.familyQueries.ListActiveMembers(ctx, user.FamilyID, connectorRole)
				if err != nil {
					return nil, err
				}
				members := make([]userPublic, 0, len(rows))
				for _, row := range rows {
					member := s.userPublicFromFamilyMember(row)
					member.RoleID, _ = s.roles.UserRoleID(ctx, row.ID)
					s.hydrateUserRole(ctx, &member)
					members = append(members, member)
				}
				return members, nil
			}}.ListMembers(w, r)
		}),
		ListRoles: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			roleHandler.List(w, r, roleActor(user))
		}),
		CreateRole: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			roleHandler.Create(w, r, roleActor(user))
		}),
		UpdateRole: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			roleHandler.Update(w, r, roleActor(user))
		}),
		DeleteRole: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			roleHandler.Delete(w, r, roleActor(user))
		}),
		ChangeRole: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FamilyMemberHandler{Change: func(ctx context.Context, targetID, role string) (any, int, string, error) {
				if !hasPermission(user, permissionManageMembers) {
					return nil, http.StatusForbidden, "Permission denied", fmt.Errorf("permission denied")
				}
				target, err := s.getUserByID(targetID)
				if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
					return nil, http.StatusNotFound, "Member not found", fmt.Errorf("member not found")
				}
				if target.Role == ownerRole || role == "" {
					return nil, http.StatusForbidden, "The server owner role cannot be changed", fmt.Errorf("owner role")
				}
				assignedRole, err := s.loadServerRole(ctx, user.FamilyID, role)
				if err != nil {
					return nil, http.StatusUnprocessableEntity, "Invalid role", err
				}
				if assignedRole.IsDefault && assignedRole.Name == "Admin" && !hasPermission(user, permissionManageRoles) {
					return nil, http.StatusForbidden, "Only role managers can assign the Admin role", fmt.Errorf("role permission")
				}
				if err := s.assignServerRole(ctx, user.FamilyID, target.ID, role); err != nil {
					return nil, http.StatusInternalServerError, "Could not update role", err
				}
				updated, _ := s.getUserByID(target.ID)
				return updated, 0, "", nil
			}}.ChangeRole(w, r)
		}),
		RemoveMember: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FamilyMemberHandler{Remove: func(ctx context.Context, targetID string) (int, string, error) {
				if !hasPermission(user, permissionManageMembers) {
					return http.StatusForbidden, "Permission denied", errForbidden
				}
				if targetID == user.ID {
					return http.StatusForbidden, "You cannot remove yourself", fmt.Errorf("self removal")
				}
				target, err := s.getUserByID(targetID)
				if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
					return http.StatusNotFound, "Member not found", fmt.Errorf("member not found")
				}
				if target.Role == ownerRole {
					return http.StatusForbidden, "The server owner cannot be removed", errForbidden
				}
				if err := s.familyMembership.Remove(ctx, target.ID, nowString()); err != nil {
					return http.StatusInternalServerError, "Could not remove member", err
				}
				return 0, "", nil
			}}.RemoveMember(w, r)
		}),
		GetMemberAdminDetails: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FamilyMemberHandler{AdminDetails: func(ctx context.Context, targetID string) (any, int, string, error) {
				target, err := s.getUserByID(targetID)
				if err != nil {
					return nil, http.StatusNotFound, "Member not found", errNotFound
				}
				if err = authorizeMemberSafety(user, target, true); err != nil {
					if errors.Is(err, errNotFound) {
						return nil, http.StatusNotFound, "Member not found", err
					}
					return nil, http.StatusForbidden, "Permission denied", err
				}
				details, err := s.loadMemberAdminDetails(ctx, target)
				if err != nil {
					return nil, http.StatusInternalServerError, "Could not load member details", err
				}
				// Inspection is allowed, but never reveal IP information for a
				// self or owner row: those targets cannot be banned here.
				details = redactMemberIPDetails(user, target, details)
				return details, 0, "", nil
			}}.GetAdminDetails(w, r)
		}),
		BanMemberIP: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FamilyMemberHandler{BanIP: func(ctx context.Context, targetID, rawIP string) (int, string, error) {
				target, err := s.getUserByID(targetID)
				if err != nil {
					return http.StatusNotFound, "Member not found", errNotFound
				}
				if err = authorizeMemberSafety(user, target, false); err != nil {
					if errors.Is(err, errNotFound) {
						return http.StatusNotFound, "Member not found", err
					}
					return http.StatusForbidden, "You cannot block your own IP or manage the server owner", err
				}
				ip, err := s.ensureMemberIPCandidate(ctx, target.ID, rawIP)
				if err != nil {
					return http.StatusUnprocessableEntity, "Invalid or unavailable member IP", err
				}
				err = s.banMemberIPAndDisconnect(ctx, user.FamilyID, target.ID, ip, user.ID)
				if err != nil {
					if errors.Is(err, errMemberIPAlreadyBanned) {
						return http.StatusConflict, "This exact IP is already blocked for this family", err
					}
					if errors.Is(err, errMemberIPBanPublish) {
						return http.StatusServiceUnavailable, "IP ban was saved, but remote sessions may remain connected. Retry to revoke them.", err
					}
					return http.StatusInternalServerError, "Could not block IP address", err
				}
				return 0, "", nil
			}}.BanMemberIP(w, r)
		}),
		UnbanMemberIP: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FamilyMemberHandler{UnbanIP: func(ctx context.Context, targetID string) (int, string, error) {
				target, err := s.getUserByID(targetID)
				if err != nil {
					return http.StatusNotFound, "Member not found", errNotFound
				}
				if err = authorizeMemberSafety(user, target, false); err != nil {
					if errors.Is(err, errNotFound) {
						return http.StatusNotFound, "Member not found", err
					}
					return http.StatusForbidden, "Permission denied", err
				}
				removed, err := s.memberIPs.Unban(ctx, user.FamilyID, target.ID)
				if err != nil {
					return http.StatusInternalServerError, "Could not lift IP block", err
				}
				if !removed {
					return http.StatusNotFound, "No member IP block is available", errNotFound
				}
				return 0, "", nil
			}}.UnbanMemberIP(w, r)
		}),
		GetPlans: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			plans.HandleGetPlans(w, r, httptransport.PlanActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		CreatePlan: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			plans.HandleCreatePlan(w, r, httptransport.PlanActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		RSVPToPlan: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			plans.HandlePlanRSVP(w, r, httptransport.PlanActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
	}
}

func (s *Server) inviteRoutes() httptransport.InviteRoutes {
	previewHandler := httptransport.InvitePreviewHandler{Find: func(ctx context.Context, token string) (any, error) {
		invite, family, err := s.findInviteByToken(ctx, token)
		if err != nil {
			return nil, err
		}
		return invitePreviewResponse{FamilyName: family.Name, Role: invite.Role, ExpiresAt: invite.ExpiresAt, UsesRemaining: invite.MaxUses - invite.UsedCount}, nil
	}}

	acceptHandler := httptransport.InviteAcceptHandler{
		ClientIP: s.getClientIP,
		Accept: func(ctx context.Context, token string, payload httptransport.InviteAcceptRequest, clientIP string) (any, int, string, error) {
			invite, family, err := s.findInviteByToken(ctx, token)
			if err != nil {
				return nil, http.StatusNotFound, "Invite not found", err
			}
			if err := s.rejectBannedInviteIP(ctx, family.ID, clientIP); err != nil {
				return nil, http.StatusUnauthorized, "Invite not found", err
			}
			defaults, err := s.familyDefaults.Get(ctx, family.ID)
			if err != nil {
				return nil, http.StatusInternalServerError, "Could not load member defaults", err
			}

			passwordHash, err := hashPassword(payload.Password)
			if err != nil {
				return nil, http.StatusInternalServerError, "Could not hash password", err
			}

			userID := uuid.NewString()
			now := nowString()
			refreshToken, refreshHash, refreshExpires, err := s.issueRefreshToken(userID)
			if err != nil {
				return nil, http.StatusInternalServerError, "Could not create session", err
			}

			err = s.familyInvites.Accept(ctx, featurefamily.InviteAcceptance{
				UserID: userID, FamilyID: family.ID, Username: payload.Username, PasswordHash: passwordHash,
				DisplayName: payload.DisplayName, Role: invite.Role, InviteID: invite.ID,
				RefreshTokenID: uuid.NewString(), TokenHash: refreshHash, ExpiresAt: refreshExpires,
				CreatedAt: now, IPAddress: clientIP, ProfileVisibility: defaults.ProfileVisibility,
				LastSeenVisibility: defaults.LastSeenVisibility, ReadReceiptsEnabled: defaults.ReadReceiptsEnabled,
			})
			if err != nil {
				if strings.Contains(strings.ToLower(err.Error()), "unique") {
					return nil, http.StatusConflict, "Username already exists", err
				}
				return nil, http.StatusInternalServerError, "Could not accept invite", err
			}

			newUser, err := s.getUserByID(userID)
			if err != nil {
				return nil, http.StatusInternalServerError, "Could not load user", err
			}
			accessToken, expiresInSeconds, err := createAccessToken(s.cfg, newUser)
			if err != nil {
				return nil, http.StatusInternalServerError, "Could not create access token", err
			}
			return httptransport.AuthSuccess[userPublic]{
				AccessToken:      accessToken,
				TokenType:        "Bearer",
				ExpiresInSeconds: expiresInSeconds,
				User:             newUser,
				RefreshToken:     refreshToken,
			}, 0, "", nil
		},
		WriteSuccess: func(w http.ResponseWriter, r *http.Request, status int, response any) {
			s.writeAuthSuccess(w, r, status, response.(httptransport.AuthSuccess[userPublic]))
		},
	}

	return httptransport.InviteRoutes{
		CreateInvite: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.InviteCreateHandler{
				IsAdmin:     func() bool { return hasPermission(user, permissionManageMembers) },
				IsValidRole: isValidRole,
				Create: func(ctx context.Context, payload httptransport.InviteCreateRequest) (any, int, string, error) {
					expiresHours := 48
					if payload.ExpiresInHours != nil {
						expiresHours = *payload.ExpiresInHours
					}
					maxUses := 1
					if payload.MaxUses != nil {
						maxUses = *payload.MaxUses
					}
					rawToken, err := randomToken()
					if err != nil {
						return nil, http.StatusInternalServerError, "Could not create invite", err
					}
					inviteID := uuid.NewString()
					expiresAt := time.Now().Add(time.Duration(expiresHours) * time.Hour).UTC()
					if err := s.familyInvites.Create(ctx, featurefamily.InviteCreate{
						ID: inviteID, FamilyID: user.FamilyID, TokenHash: tokenHash(s.cfg.InviteTokenSecret, rawToken),
						Role: payload.Role, ExpiresAt: expiresAt, MaxUses: maxUses, CreatedBy: user.ID, CreatedAt: nowString(),
					}); err != nil {
						return nil, http.StatusInternalServerError, "Could not create invite", err
					}

					invite, err := s.getInviteByID(ctx, inviteID)
					if err != nil {
						return nil, http.StatusInternalServerError, "Could not load invite", err
					}

					family, err := s.getFamily(user.FamilyID)
					if err != nil {
						return nil, http.StatusNotFound, "Family not found", err
					}
					inviteURL := buildInviteURL(family, s.cfg.AppURL, s.cfg.APIURL, rawToken)
					return httptransport.InviteCreateResponse{
						InviteURL: inviteURL,
						Invite:    invite,
					}, 0, "", nil
				},
			}.CreateInvite(w, r)
		}),
		PreviewInvite:  http.HandlerFunc(previewHandler.ServeHTTP),
		AcceptInvite:   http.HandlerFunc(acceptHandler.AcceptInvite),
		PasskeyOptions: http.HandlerFunc(s.invitePasskeyOptions),
		AcceptPasskey:  http.HandlerFunc(s.acceptInviteWithPasskey),
		DeleteInvite: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.InviteDeleteHandler{
				IsAdmin: func() bool { return hasPermission(user, permissionManageMembers) },
				Revoke: func(ctx context.Context, inviteID string) (int, string, error) {
					invite, err := s.getInviteByID(ctx, inviteID)
					if err != nil || invite.FamilyID != user.FamilyID {
						return http.StatusNotFound, "Invite not found", fmt.Errorf("invite not found")
					}
					if err := s.familyInvites.Revoke(ctx, invite.ID, nowString()); err != nil {
						return http.StatusInternalServerError, "Could not revoke invite", err
					}
					return 0, "", nil
				},
			}.DeleteInvite(w, r)
		}),
	}
}

func (s *Server) chatRoutes() httptransport.ChatRoutes {
	chatMutation := func(user userPublic) httptransport.ChatMutationHandler {
		return httptransport.NewChatMutationHandler(httptransport.ChatMutationOperations{
			Create: func(ctx context.Context, kind string, request httptransport.ChatCreateRequest) (any, int, error) {
				return s.createChat(ctx, user, kind, request)
			},
			AddMembers: func(ctx context.Context, chatID string, userIDs []string) (any, int, error) {
				return s.addChatMembers(ctx, user, chatID, userIDs)
			},
			Preferences: func(ctx context.Context, chatID string, request httptransport.ChatPreferencesRequest) (any, int, error) {
				return s.updateChatPreferences(ctx, user, chatID, request)
			},
			Update: func(ctx context.Context, chatID string, request httptransport.ChatUpdateRequest) (any, int, error) {
				return s.updateChat(ctx, user, chatID, request)
			},
			StatusFor: domainErrorStatus,
			DetailFor: func(err error) string { return err.Error() },
		})
	}
	messageRead := httptransport.NewMessageReadHandler(httptransport.MessageReadOperations{
		Mark: func(ctx context.Context, userID, messageID string) (any, string, error) {
			user, err := s.getUserByID(userID)
			if err != nil {
				return nil, "", errNotFound
			}
			return s.markMessageRead(ctx, user, messageID)
		},
		IsMissing: func(err error) bool { return errors.Is(err, errNotFound) }, Error: func(err error) (int, string) { return domainErrorStatus(err), err.Error() },
		Published: func(ctx context.Context, chatID, messageID, userID string) {
			s.emitMessageRead(chatID, messageID, userID)
			s.bumpChatHistoryRevision(ctx, chatID)
			if s.eventBus != nil {
				s.eventBus.Publish(ctx, plugins.Event{
					Type:      plugins.EventMessageRead,
					Timestamp: time.Now().UTC(),
					Payload: map[string]interface{}{
						"chat_id":    chatID,
						"message_id": messageID,
						"reader_id":  userID,
					},
				})
			}
		},
	})
	return httptransport.ChatRoutes{
		ListChats: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatReadHandlerForUser(s, user).ListChats(w, r)
		}),
		CreateDirectChat: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).Create("direct")(w, r)
		}),
		CreateGroupChat: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).Create("group")(w, r)
		}),
		CreateChannelChat: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).Create("channel")(w, r)
		}),
		CreateVoiceChat: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).Create("voice")(w, r)
		}),
		GetChat: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatReadHandlerForUser(s, user).GetChat(w, r)
		}),
		UpdateChat: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).Update(w, r)
		}),
		AddChatMembers: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).AddMembers(w, r)
		}),
		UpdateChatPreferences: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatMutation(user).UpdatePreferences(w, r)
		}),
		GetMessages: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewMessageHistoryHandler(httptransport.MessageHistoryOperations{
				List: func(ctx context.Context, chatID, before string, limit int, threadRootMessageID, archiveGroup string) (any, error) {
					return s.messageHistoryPage(ctx, user, chatID, before, limit, threadRootMessageID, archiveGroup)
				},
				StatusFor: domainErrorStatus,
			}).Get(w, r)
		}),
		GetTranscriptForNotes: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatID := chi.URLParam(r, "chatId")
			messageID := chi.URLParam(r, "messageId")
			if _, err := s.chatQueries.GetForMember(r.Context(), chatID, user.ID); err != nil {
				s.json(w, http.StatusForbidden, map[string]string{"message": "You do not have access to this chat"})
				return
			}
			var callID string
			err := s.guestDB.QueryRowContext(r.Context(), `SELECT call_id FROM call_transcription_sessions WHERE chat_id=$1 AND notes_message_id=$2 ORDER BY created_at DESC LIMIT 1`, chatID, messageID).Scan(&callID)
			if err != nil || callID == "" {
				s.json(w, http.StatusNotFound, map[string]string{"message": "Transcript not found"})
				return
			}
			s.json(w, http.StatusOK, map[string]string{"callId": callID})
		}),
		SendMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewMessageSendHandler(httptransport.MessageSendOperations{
				Send: func(ctx context.Context, chatID string, payload httptransport.MessageSendRequest, operationID string) (any, error) {
					return s.sendRESTMessage(ctx, user, chatID, payload, operationID)
				},
				StatusFor: domainErrorStatus,
			}).Send(w, r)
		}),
		GetMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Get(w, r)
		}),
		AttachMessageFiles: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Attach(w, r)
		}),
		GetPins: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			pinHandlerForUser(s, user).GetPins(w, r)
		}),
		PinMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			pinHandlerForUser(s, user).PinMessage(w, r)
		}),
		UnpinMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			pinHandlerForUser(s, user).UnpinMessage(w, r)
		}),
		EditMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Edit(w, r)
		}),
		DeleteMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Delete(w, r)
		}),
		MarkMessageRead: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageRead.MarkRead(w, r, user.ID)
		}),
		ForwardMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Forward(w, r)
		}),
		GetMessageArchive: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).GetArchive(w, r)
		}),
		GetMessageArchiveGroups: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			groups, err := s.messageArchiveGroups(r.Context(), user)
			if err != nil {
				writeMessageDetail(w, domainErrorStatus(err), "Could not load Message Archive groups")
				return
			}
			writeMessageValue(w, http.StatusOK, groups)
		}),
		ArchiveMessage: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Archive(w, r)
		}),
		AddMessageReaction: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Reaction(w, r, true)
		}),
		RemoveMessageReaction: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			messageHandlersForUser(s, user).Reaction(w, r, false)
		}),
		Unfurl: s.authenticated(s.handleUnfurl),
		CreatePoll: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			chatID := chi.URLParam(r, "chatId")
			var req createPollRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid poll payload")
				return
			}
			res, status, err := s.createPoll(r.Context(), user, chatID, req)
			if err != nil {
				writeMessageDetail(w, status, err.Error())
				return
			}
			writeMessageValue(w, status, res)
		}),
		VotePoll: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			pollID := chi.URLParam(r, "pollId")
			var req votePollRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid vote payload")
				return
			}
			res, status, err := s.votePoll(r.Context(), user, pollID, req)
			if err != nil {
				writeMessageDetail(w, status, err.Error())
				return
			}
			writeMessageValue(w, status, res)
		}),
		ClosePoll: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			pollID := chi.URLParam(r, "pollId")
			res, status, err := s.closePoll(r.Context(), user, pollID)
			if err != nil {
				writeMessageDetail(w, status, err.Error())
				return
			}
			writeMessageValue(w, status, res)
		}),
		GetPollVoters: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			pollID := chi.URLParam(r, "pollId")
			res, status, err := s.getPollVoters(r.Context(), user, pollID)
			if err != nil {
				writeMessageDetail(w, status, err.Error())
				return
			}
			writeMessageValue(w, status, res)
		}),
	}
}

func chatReadHandlerForUser(s *Server, user userPublic) httptransport.ChatReadHandler {
	return httptransport.NewChatReadHandler(httptransport.ChatReadOperations{
		List: func(_ context.Context) ([]chatpresenter.Chat, error) {
			return s.listChats(user)
		},
		Get: func(_ context.Context, chatID string) (chatpresenter.Chat, error) {
			return s.buildChatPublic(chatID, user)
		},
		IsMissing: isMissing,
		LogError: func(operation string, err error) {
			s.logger.Errorf("chats", "%s failed user_id=%s error=%v", operation, user.ID, err)
		},
	})
}

func pinHandlerForUser(s *Server, user userPublic) httptransport.PinHandler {
	return httptransport.NewPinHandler(httptransport.PinOperations{
		Pin: func(ctx context.Context, chatID, messageID string) (any, int, error) {
			return s.pinMessage(ctx, chatID, messageID, user)
		},
		Unpin: func(ctx context.Context, chatID, messageID string) (any, error) {
			return s.unpinMessage(ctx, chatID, messageID, user)
		},
		List: func(ctx context.Context, chatID string) (any, error) { return s.listPins(ctx, chatID, user) },
		StatusFor: func(err error) int {
			if status, ok := err.(statusError); ok {
				return status.Status
			}
			return http.StatusInternalServerError
		},
		DetailFor: func(err error) string {
			if status, ok := err.(statusError); ok {
				return status.Message
			}
			return "Failed to manage pins"
		},
	})
}

// messageHandlersForUser binds the authenticated principal outside the HTTP
// adapter, leaving its request/response mapping fully transport-owned.
func messageHandlersForUser(s *Server, user userPublic) httptransport.MessageHandler {
	return httptransport.NewMessageHandler(httptransport.MessageHandlerOperations{
		Get: func(ctx context.Context, messageID string) (any, error) {
			meta, err := s.messageReads.Target(ctx, messageID)
			if err != nil {
				return nil, err
			}
			if _, err := s.buildChatPublic(meta.ChatID, user); err != nil {
				return nil, err
			}
			return s.buildMessage(meta.MessageID, user.ID)
		},
		Forward: func(ctx context.Context, messageID, chatID string) (any, error) {
			return s.forwardMessage(ctx, user, messageID, chatID)
		},
		Attach: func(ctx context.Context, messageID string, fileIDs []string) (any, error) {
			meta, err := s.messageReads.Target(ctx, messageID)
			if err != nil {
				return nil, err
			}
			if meta.SenderID != user.ID {
				return nil, errAttachmentSenderOnly
			}
			if _, err := s.loadAttachmentsForMessage(fileIDs, user, meta.ChatID); err != nil {
				return nil, err
			}
			if err := s.messageAttachments.Attach(ctx, featuremessages.AttachmentCommand{MessageID: meta.MessageID, ChatID: meta.ChatID, FamilyID: user.FamilyID, FileIDs: fileIDs}); err != nil {
				return nil, err
			}
			message, err := s.buildMessage(meta.MessageID, user.ID)
			if err != nil {
				return nil, err
			}
			s.emitMessageUpdated(meta.ChatID, message)
			s.bumpChatHistoryRevision(ctx, meta.ChatID)
			return message, nil
		},
		GetArchive: func(_ context.Context) (any, error) { return s.ensureMessageArchive(user) },
		Archive: func(ctx context.Context, messageID string) (any, int, error) {
			message, status, err := s.archiveMessage(ctx, user, messageID)
			return message, status, err
		},
		React: func(ctx context.Context, messageID, emoji string, add bool) (any, error) {
			message, err := s.setMessageReaction(ctx, user, messageID, emoji, add)
			if err != nil {
				return nil, err
			}
			s.emitMessageUpdated(message.ChatID, message)
			s.bumpChatHistoryRevision(ctx, message.ChatID)
			return message, nil
		},
		Edit: func(ctx context.Context, messageID, content string) (any, error) {
			return s.editMessage(ctx, user, messageID, content)
		},
		Delete: func(ctx context.Context, messageID, scope string) (any, error) {
			return s.deleteMessage(ctx, user, messageID, scope)
		},
		StatusFor: func(err error) int {
			if errors.Is(err, errAttachmentSenderOnly) {
				return http.StatusForbidden
			}
			return domainErrorStatus(err)
		},
		DetailFor: func(err error) string {
			if errors.Is(err, errAttachmentSenderOnly) {
				return "Only the sender can attach files"
			}
			return err.Error()
		},
	})
}

func (s *Server) fileRoutes() httptransport.FileRoutes {
	media := httptransport.NewMediaHandler(httptransport.MediaOperations{
		Mint: func(ctx context.Context, fileID string) (httptransport.MediaPlaybackToken, error) {
			return httptransport.MediaPlaybackToken{}, errors.New("authenticated media handler required")
		},
		Open: func(ctx context.Context, fileID, token string) (httptransport.MediaStream, error) {
			return s.openMediaPlayback(ctx, fileID, token)
		},
		StatusFor: domainErrorStatus, DetailFor: func(err error) string { return err.Error() },
	})
	return httptransport.FileRoutes{
		Upload: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewFileUploadHandler(s.cfg.MaxUploadSizeBytes, httptransport.FileUploadOperations{
				Upload: func(ctx context.Context, input httptransport.MultipartUploadInput) (any, int, string, error) {
					return s.uploadFile(ctx, user, input)
				},
			}).Upload(w, r)
		}),
		ReserveDirectUpload: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewDirectUploadHandler(httptransport.DirectUploadOperations{
				Reserve: func(ctx context.Context, key string, payload httptransport.ReserveDirectFileUploadRequest) (httptransport.DirectFileUploadResponse, int, string, error) {
					return s.reserveDirectFileUpload(ctx, user, key, payload)
				},
			}).Reserve(w, r)
		}),
		GetDirectUpload: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewDirectUploadReadHandler(httptransport.DirectUploadReadOperations{
				Load: func(ctx context.Context, uploadID string) (httptransport.DirectFileUploadResponse, bool, bool, error) {
					record, found, err := s.directUploads.FindByID(ctx, uploadID, user.ID)
					if err != nil || !found {
						return httptransport.DirectFileUploadResponse{}, found, false, err
					}
					response, err := s.directUploadReservationResponse(ctx, record)
					return response, true, err != nil, err
				},
			}).GetDirectUpload(w, r)
		}),
		CompleteDirectUpload: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewDirectUploadHandler(httptransport.DirectUploadOperations{
				Complete: func(ctx context.Context, uploadID string) (httptransport.DirectFileUploadResponse, int, string, error) {
					return s.completeDirectFileUpload(ctx, user, uploadID)
				},
			}).Complete(w, r)
		}),
		List: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewFileListHandler(httptransport.FileListOperations{
				List: func(ctx context.Context) ([]httptransport.FileListItem, error) {
					fileIDs, err := s.fileListing.VisibleFamilyFileIDs(ctx, user.FamilyID)
					if err != nil {
						return nil, err
					}
					files := make([]httptransport.FileListItem, 0)
					for _, fileID := range fileIDs {
						file, err := s.buildFilePublic(fileID, user.ID)
						if err == nil && file.DeletedAt == nil && s.fileReadyForPublic(ctx, file.ID) && s.fileVisibleToUser(ctx, file, user) {
							files = append(files, fileListItemFromPublic(file))
						}
					}
					return files, nil
				},
			}).GetFiles(w, r)
		}),
		Get: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewFileDetailHandler(httptransport.FileDetailOperations{
				Get: func(ctx context.Context, fileID string) (any, error) {
					return s.getFile(ctx, user, fileID)
				},
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}).GetFile(w, r)
		}),
		CreateDirectAccess: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewFileAccessHandler(httptransport.FileAccessOperations{
				Create: func(ctx context.Context, fileID string) (any, error) {
					return s.createDirectFileAccess(ctx, user, fileID)
				},
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}).Create(w, r)
		}),
		Download: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewFileDeliveryHandler(httptransport.FileDeliveryOperations{
				Download: func(ctx context.Context, fileID string) (httptransport.FileDelivery, error) {
					return s.downloadFile(ctx, user, fileID)
				},
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}).Download(w, r)
		}),
		Thumbnail: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewFileDeliveryHandler(httptransport.FileDeliveryOperations{
				Thumbnail: func(ctx context.Context, fileID string) (httptransport.FileDelivery, error) {
					return s.downloadThumbnail(ctx, user, fileID)
				},
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}).Thumbnail(w, r)
		}),
		CreatePlaybackToken: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewMediaHandler(httptransport.MediaOperations{
				Mint: func(ctx context.Context, fileID string) (httptransport.MediaPlaybackToken, error) {
					return s.mintMediaPlayback(ctx, user, fileID)
				},
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}).Mint(w, r)
		}),
		UpdatePreferences: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FileMutationHandler{
				SetFavorite: func(ctx context.Context, fileID string, isFavorite bool) (any, error) {
					return s.setFileFavorite(ctx, fileID, isFavorite, user)
				},
				Delete:    func(ctx context.Context, fileID string) error { return s.deleteFile(ctx, fileID, user) },
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}.UpdatePreferences(w, r)
		}),
		Transcribe: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FileTranscriptionHandler{
				Transcribe: func(ctx context.Context, fileID string) (any, int, string) {
					return s.transcribeFile(ctx, user, fileID)
				},
			}.TranscribeFile(w, r)
		}),
		GetTranscript: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FileTranscriptionHandler{
				Get: func(ctx context.Context, fileID string) (any, int, string) {
					return s.getFileTranscript(ctx, user, fileID)
				},
			}.GetTranscript(w, r)
		}),
		Delete: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.FileMutationHandler{
				SetFavorite: func(ctx context.Context, fileID string, isFavorite bool) (any, error) {
					return s.setFileFavorite(ctx, fileID, isFavorite, user)
				},
				Delete:    func(ctx context.Context, fileID string) error { return s.deleteFile(ctx, fileID, user) },
				StatusFor: domainErrorStatus,
				DetailFor: func(err error) string { return err.Error() },
			}.DeleteFile(w, r)
		}),
		StreamMedia: http.HandlerFunc(media.Stream),
		Collections: s.collectionRoutes(),
	}
}

func (s *Server) adminRoutes() httptransport.AdminRoutes {
	return httptransport.AdminRoutes{
		ListPlugins: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			if err := s.requireAdmin(user); err != nil {
				writeMessageValue(w, http.StatusForbidden, map[string]string{"detail": "Admin access required"})
				return
			}
			if s.plugins == nil {
				writeMessageValue(w, http.StatusOK, []plugins.Status{})
				return
			}
			writeMessageValue(w, http.StatusOK, s.plugins.Statuses())
		}),
		UpdatePlugin: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			if err := s.requireAdmin(user); err != nil {
				writeMessageValue(w, http.StatusForbidden, map[string]string{"detail": "Admin access required"})
				return
			}
			var request struct {
				Enabled *bool `json:"enabled"`
			}
			if err := s.decodeJSON(r, &request); err != nil || request.Enabled == nil {
				writeMessageValue(w, http.StatusBadRequest, map[string]string{"detail": "enabled is required"})
				return
			}
			if s.plugins == nil {
				writeMessageValue(w, http.StatusNotFound, map[string]string{"detail": "Plugin not found"})
				return
			}
			status, err := s.plugins.SetEnabled(r.Context(), chi.URLParam(r, "pluginId"), *request.Enabled)
			if err != nil {
				writeMessageValue(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
				return
			}
			writeMessageValue(w, http.StatusOK, status)
		}),
		Logs: httptransport.NewAdminLogsHandler(httptransport.AdminLogsDependencies{
			Authorize: func(r *http.Request) int {
				user, err := s.currentUser(r)
				if err != nil {
					return http.StatusUnauthorized
				}
				if s.requireAdmin(user) != nil {
					return http.StatusForbidden
				}
				return 0
			},
			Records: func() []httptransport.AdminLogRecord {
				records := s.logBuffer.Records()
				out := make([]httptransport.AdminLogRecord, len(records))
				for i, record := range records {
					out[i] = httptransport.AdminLogRecord(record)
				}
				return out
			},
		}),
		GetPublicAccess: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).Get(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		UpdatePublicAccess: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).Update(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		PublicAccessSuggestions: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).Suggestions(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		PublicAccessCheck: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).Check(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		TunnelStatus: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).TunnelStatus(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		TunnelStart: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).TunnelStart(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		TunnelStop: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).TunnelStop(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		QuickStart: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).QuickStart(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		PublicIPQuickStart: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).PublicIPQuickStart(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		DomainLink: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).DomainLink(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		GetEncryptionSettings: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).GetEncryption(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		UpdateEncryptionSettings: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminPublicAccessHandler(user).UpdateEncryption(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		GetNotificationProvider: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminNotificationProviderHandler(user).Get(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		UpdateNotificationProvider: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.adminNotificationProviderHandler(user).Update(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		ListMCPConnectors: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewMCPConnectorReadHandler(httptransport.MCPConnectorReadOperations{
				IsAdmin: func() bool { return hasPermission(user, permissionManageIntegrations) },
				List:    func(ctx context.Context) (any, error) { return s.listMCPConnectors(user.FamilyID) },
			}).List(w, r)
		}),
		CreateMCPConnector: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.mcpAdminHandler(user).Create(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		GetMCPConnector: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			httptransport.NewMCPConnectorReadHandler(httptransport.MCPConnectorReadOperations{
				IsAdmin: func() bool { return hasPermission(user, permissionManageIntegrations) },
				Get: func(ctx context.Context, connectorID string) (any, error) {
					connector, err := s.loadMCPConnectorByID(user.FamilyID, connectorID)
					if err != nil {
						return nil, err
					}
					return connector.toPublic(), nil
				},
			}).Get(w, r)
		}),
		UpdateMCPConnector: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.mcpAdminHandler(user).Update(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		RegenerateMCPConnectorToken: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.mcpAdminHandler(user).RegenerateToken(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		RevokeMCPConnector: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.mcpAdminHandler(user).Revoke(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
		ListMCPConnectorAudit: s.authenticated(func(w http.ResponseWriter, r *http.Request, user userPublic) {
			s.mcpAdminHandler(user).ListAudit(w, r, httptransport.AdminActor{ID: user.ID, FamilyID: user.FamilyID, Role: user.Role})
		}),
	}
}

func (s *Server) mcpRoutes() http.Handler {
	if s.mcpHTTP == nil {
		return nil
	}
	return s.mcpAuthMiddleware(s.mcpHTTP)
}

func (s *Server) pluginRoutes() http.Handler {
	r := chi.NewRouter()
	r.Mount("/canvas", s.canvasRoutes())
	r.Mount("/checklist", s.checklistRoutes())
	if s.plugins != nil {
		for _, p := range s.plugins.List() {
			p.RegisterRoutes(r)
		}
	}
	return r
}

func writeMessageValue(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeMessageDetail(w http.ResponseWriter, status int, detail string) {
	writeMessageValue(w, status, map[string]string{"detail": detail})
}
