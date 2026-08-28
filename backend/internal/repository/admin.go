package repository

import (
	"context"

	"stovo-messenger/backend/ent"
)

// UpdateFamilyPublicURLs sets public_app_url and public_api_url (nil clears).
func (s *Store) UpdateFamilyPublicURLs(ctx context.Context, familyID string, appURL, apiURL *string, updatedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		return s.updateFamilyPublicURLsTx(ctx, tx, familyID, appURL, apiURL, updatedAt)
	})
}

func (s *Store) updateFamilyPublicURLsTx(ctx context.Context, tx *ent.Tx, familyID string, appURL, apiURL *string, updatedAt string) error {
	upd := tx.Family.UpdateOneID(familyID).SetUpdatedAt(updatedAt)
	if appURL != nil {
		upd.SetPublicAppURL(*appURL)
	} else {
		upd.ClearPublicAppURL()
	}
	if apiURL != nil {
		upd.SetPublicAPIURL(*apiURL)
	} else {
		upd.ClearPublicAPIURL()
	}
	_, err := upd.Save(ctx)
	return err
}

// UpdateFamilyEncryptionProtocol sets default_message_encryption_protocol.
func (s *Store) UpdateFamilyEncryptionProtocol(ctx context.Context, familyID, protocol, updatedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		_, err := tx.Family.UpdateOneID(familyID).
			SetDefaultMessageEncryptionProtocol(protocol).
			SetUpdatedAt(updatedAt).
			Save(ctx)
		return err
	})
}
