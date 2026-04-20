class RemoveMagicLinkColumnsFromUsers < ActiveRecord::Migration[8.1]
  def change
    remove_index  :users, :magic_link_token, unique: true, if_exists: true
    safety_assured { remove_column :users, :magic_link_token, :string }
    safety_assured { remove_column :users, :magic_link_token_expires_at, :datetime }
  end
end
