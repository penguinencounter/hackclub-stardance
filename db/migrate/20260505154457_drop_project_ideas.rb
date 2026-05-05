class DropProjectIdeas < ActiveRecord::Migration[8.1]
  def change
    drop_table :project_ideas
  end
end
