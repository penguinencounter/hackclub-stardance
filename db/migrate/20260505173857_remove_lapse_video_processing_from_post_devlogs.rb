class RemoveLapseVideoProcessingFromPostDevlogs < ActiveRecord::Migration[8.1]
  def change
    safety_assured { remove_column :post_devlogs, :lapse_video_processing, :boolean }
  end
end
